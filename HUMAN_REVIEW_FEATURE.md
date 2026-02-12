# Human Review & Knowledge Pool Feature

## Overview

This feature enables human review and labeling of VoiceAgent data extractions to improve accuracy over time. It includes:

1. **Human Review System**: Review calls with data quality issues and submit corrections
2. **Knowledge Pool**: Store and utilize human corrections to improve future extractions  
3. **Attempt Tracking**: Monitor how many attempts are needed to capture each data point
4. **Analytics Dashboard**: Visualize capture rates and identify improvement areas

---

## 🗄️ Database Schema

### New Tables

#### `DataLabel` Table
Stores human-corrected labels for misidentified data points:

```prisma
model DataLabel {
  id                String
  callSessionId     String
  voiceAgentId      String?
  fieldName         String      // "name", "model", "email", "test_drive"
  fieldLabel        String?     // Human-readable label
  originalValue     String?     // What AI extracted
  correctedValue    String      // Correct value
  correctionReason  String?     // Why it was wrong
  audioSnippet      String?     // Transcript snippet
  userUtterance     String?     // Exact user words
  isCorrect         Boolean     // true = correction needed
  attemptNumber     Int?        // Which attempt (1, 2, 3+)
  labeledBy         String      // User who labeled
  labeledAt         DateTime
  notes             String?
}
```

#### `CallSession` Enhancements
Added review status tracking:

```prisma
reviewStatus  ReviewStatus  @default(NO_ISSUES)
reviewedAt    DateTime?
reviewedBy    String?
```

### Review Status Enum

```prisma
enum ReviewStatus {
  PENDING       // Needs human review
  IN_REVIEW     // Currently being reviewed
  REVIEWED      // Human review completed
  NO_ISSUES     // Auto-marked as good quality
}
```

---

## 🚀 Deployment Steps

### 1. Apply Database Migration

```bash
cd /opt/kia-va-g2.5/admin-ui
npx prisma@5.22.0 migrate deploy
npx prisma@5.22.0 generate
```

### 2. Restart Services

```bash
# Restart Admin UI
sudo systemctl restart kia-admin-ui

# Restart Telephony Service
sudo systemctl restart kia-g25-telephony
```

### 3. Verify Deployment

```bash
# Check Admin UI logs
pm2 logs kia-admin-ui --lines 50

# Check Telephony logs
sudo journalctl -u kia-g25-telephony -f
```

---

## 📊 Features

### 1. Human Review Tab

**Location**: Admin UI → VoiceAgent → Human Review

**Features**:
- List calls needing review with data quality scores
- Filter by review status (Pending, In Review, Reviewed)
- Review extracted data field-by-field
- Submit corrections with reasons
- Mark calls as "No Issues"

**Quality Score Calculation**:
```
Quality Score = (Fields without issues / Total fields) × 100
```

### 2. Attempt Indicators

**Location**: Admin UI → Calls → Call Details → Extracted Data

**Displays**:
- ✓ 1st attempt (green badge)
- ⚠ 2nd attempt (yellow badge)  
- ⚠ 3rd+ attempts (red badge)
- ✗ Not captured (gray badge)

**Additional Info**:
- Attempt history details
- Remarks about the field
- Confidence scores

### 3. Analytics Dashboard

**Location**: Admin UI → VoiceAgent → Overview → Data Capture Attempts

**Metrics**:
- Overall capture rate
- 1st attempt success rate
- 2nd attempt rate
- 3+ attempt rate

**Visualizations**:
- Stacked bar chart by field
- Field-level statistics table
- Insights & recommendations

### 4. Knowledge Pool Integration

**Automatic**:
The telephony service automatically fetches and uses the knowledge pool to augment system instructions with examples of commonly misheard terms.

**How it Works**:
1. Human reviews a call and submits corrections
2. Corrections are stored in the `DataLabel` table
3. Telephony service fetches corrections via `/api/knowledge-pool`
4. System instructions are augmented with examples
5. VoiceAgent learns from past mistakes

**Example Augmentation**:
```
**Common Mistakes for Customer Names:**
- Incorrectly heard as "Suman", Correct value: "Shubham", (pronunciation issue)
- Incorrectly heard as "Amit", Correct value: "Ankit", (misheard)

Pay special attention to these terms when extracting customer names.
```

---

## 🔌 API Endpoints

### Human Review

#### GET `/api/calls/review`
Fetch calls needing review

**Query Parameters**:
- `voiceAgentId`: Filter by agent
- `status`: PENDING | IN_REVIEW | REVIEWED
- `page`: Page number (default: 1)
- `limit`: Results per page (default: 20)

**Response**:
```json
{
  "success": true,
  "calls": [
    {
      "id": "call_123",
      "callId": "xyz",
      "voiceAgent": { "id": "...", "name": "...", "slug": "..." },
      "startedAt": "2026-02-12T...",
      "reviewStatus": "PENDING",
      "extractedFields": [
        {
          "fieldName": "name",
          "fieldLabel": "Customer Name",
          "value": "Suman",
          "attempts": 2,
          "attemptsDetails": "1st: empty, 2nd: Suman",
          "remarks": "verified",
          "needsReview": true
        }
      ],
      "fieldsNeedingReview": 2,
      "totalFields": 4,
      "dataQualityScore": 50
    }
  ],
  "pagination": { "page": 1, "limit": 20, "totalCount": 15, "totalPages": 1 }
}
```

#### PATCH `/api/calls/review`
Update review status

**Body**:
```json
{
  "callSessionId": "call_123",
  "reviewStatus": "REVIEWED",
  "reviewedBy": "user@example.com"
}
```

### Labels

#### POST `/api/calls/{id}/labels`
Submit human labels

**Body**:
```json
{
  "labels": [
    {
      "fieldName": "name",
      "fieldLabel": "Customer Name",
      "originalValue": "Suman",
      "correctedValue": "Shubham",
      "correctionReason": "pronunciation",
      "isCorrect": false,
      "attemptNumber": 2,
      "notes": "Customer has a strong accent"
    }
  ],
  "labeledBy": "user@example.com"
}
```

#### GET `/api/calls/{id}/labels`
Fetch labels for a call

### Knowledge Pool

#### GET `/api/knowledge-pool`
Fetch knowledge pool for telephony service

**Query Parameters**:
- `voiceAgentSlug`: Filter by agent
- `fieldName`: Filter by field
- `limit`: Max results (default: 100)
- `onlyCorrections`: Return only corrections (default: true)

**Response**:
```json
{
  "success": true,
  "knowledgePool": [
    {
      "id": "label_123",
      "voiceAgent": "spotlight",
      "fieldName": "name",
      "fieldLabel": "Customer Name",
      "originalValue": "Suman",
      "correctedValue": "Shubham",
      "correctionReason": "pronunciation",
      "audioSnippet": "...",
      "userUtterance": "...",
      "labeledAt": "2026-02-12T...",
      "callId": "xyz"
    }
  ],
  "groupedByField": {
    "name": [...],
    "model": [...],
    "email": [...]
  },
  "totalCount": 25
}
```

### Attempt Analytics

#### GET `/api/analytics/attempts`
Get aggregate attempt statistics

**Query Parameters**:
- `voiceAgentId`: Filter by agent
- `startDate`: Start date (ISO format)
- `endDate`: End date (ISO format)
- `fieldName`: Filter by specific field

**Response**:
```json
{
  "success": true,
  "overallStats": {
    "totalFields": 120,
    "totalCalls": 30,
    "firstAttemptSuccess": 85,
    "firstAttemptRate": 71,
    "secondAttemptSuccess": 25,
    "secondAttemptRate": 21,
    "thirdPlusAttemptSuccess": 5,
    "thirdPlusAttemptRate": 4,
    "notCaptured": 5,
    "notCapturedRate": 4,
    "overallCaptureRate": 96
  },
  "fieldStats": [
    {
      "fieldName": "name",
      "total": 30,
      "firstAttempt": 22,
      "firstAttemptRate": 73,
      "secondAttempt": 6,
      "secondAttemptRate": 20,
      "thirdPlusAttempt": 1,
      "thirdPlusAttemptRate": 3,
      "notCaptured": 1,
      "notCapturedRate": 3,
      "captureRate": 97
    }
  ]
}
```

---

## 📝 Usage Workflow

### Typical Human Review Workflow

1. **Identify Calls Needing Review**:
   - Go to VoiceAgent → Human Review tab
   - See list of calls with low quality scores
   - Filter by "Pending Review"

2. **Review a Call**:
   - Click "Review" on a call
   - See each extracted field with:
     - Original value
     - Attempt count
     - Attempt history
     - Remarks

3. **Submit Corrections**:
   - For each field:
     - Mark "Original is correct" if accurate
     - OR enter corrected value
     - Select correction reason
     - Add notes about context
   - Click "Submit Labels"

4. **Knowledge Pool Auto-Updates**:
   - Corrections stored in database
   - Telephony service fetches on next call setup
   - System instructions augmented with examples
   - Future calls benefit from corrections

5. **Monitor Improvement**:
   - Go to Overview → Data Capture Attempts
   - Track 1st attempt success rate over time
   - Identify fields needing attention
   - Use insights to improve training

---

## 🧪 Testing

### Test Human Review

1. Make a test call with some missing/incorrect data
2. Go to Admin UI → VoiceAgent → Human Review
3. Click "Review" on the test call
4. Submit corrections for fields
5. Verify labels saved in database

### Test Knowledge Pool

1. Submit corrections via Human Review
2. Check telephony logs on next call setup:
   ```
   [telephony] 🧠 Knowledge pool augmented with 5 corrections
   ```
3. Verify system instructions include examples

### Test Attempt Analytics

1. Make several test calls
2. Go to Overview → Data Capture Attempts
3. Verify metrics displayed correctly
4. Check field-level breakdown

---

## 🔍 Monitoring

### Check Knowledge Pool Size

```bash
cd /opt/kia-va-g2.5/admin-ui
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.dataLabel.count().then(count => {
  console.log('Total corrections in knowledge pool:', count);
  return prisma.dataLabel.groupBy({
    by: ['fieldName'],
    _count: { id: true }
  });
}).then(grouped => {
  console.log('By field:', grouped);
  process.exit(0);
});
"
```

### Check Review Status

```bash
cd /opt/kia-va-g2.5/admin-ui
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.callSession.groupBy({
  by: ['reviewStatus'],
  _count: { id: true }
}).then(stats => {
  console.log('Calls by review status:', stats);
  process.exit(0);
});
"
```

---

## 📚 Technical Details

### Knowledge Pool Caching

- Cache TTL: 15 minutes
- Fetched on:
  - Call setup (first time per agent session)
  - Every 15 minutes during active calls
  - Manual refresh via `force_refresh=True`

### Data Quality Score Algorithm

```python
fields_needing_review = count(fields where:
  - value is empty OR
  - attempts > 1 OR  
  - remarks is not empty
)

data_quality_score = (
  (total_fields - fields_needing_review) / total_fields
) * 100
```

### Attempt Tracking

Attempt data comes from `payloadJson.response_data` array:

```json
{
  "key_value": "name",
  "key_response": "Shubham",
  "attempts": 2,
  "attempts_details": "1st: empty, 2nd: Shubham",
  "remarks": "verified"
}
```

---

## 🚨 Troubleshooting

### Knowledge Pool Not Loading

**Symptoms**: Telephony logs show "Knowledge pool empty"

**Solutions**:
1. Check if corrections exist:
   ```bash
   curl http://localhost:3100/api/knowledge-pool?voiceAgentSlug=spotlight
   ```
2. Verify Admin UI is running
3. Check ADMIN_URL in telephony config

### Review Tab Empty

**Symptoms**: No calls showing in Human Review tab

**Solutions**:
1. Make test calls first
2. Check reviewStatus field in database:
   ```sql
   SELECT reviewStatus, COUNT(*) FROM "CallSession" GROUP BY reviewStatus;
   ```
3. Manually set reviewStatus to PENDING for testing

### Attempt Analytics Not Showing

**Symptoms**: Analytics show 0 data

**Solutions**:
1. Verify `response_data` exists in `payloadJson`:
   ```bash
   curl http://localhost:3100/api/voiceagents/AGENT_ID/calls/CALL_ID | jq '.payloadJson.response_data'
   ```
2. Check date filters
3. Ensure calls have attempt tracking data

---

## 🎯 Best Practices

### For Human Reviewers

1. **Be Specific**: Add detailed notes about WHY extraction failed
2. **Include Context**: Note user's exact words when available
3. **Select Correct Reason**: Choose appropriate correction reason
4. **Regular Reviews**: Review calls weekly to build knowledge pool
5. **Focus on Patterns**: Identify recurring issues for training

### For Administrators

1. **Monitor Trends**: Check attempt analytics weekly
2. **Update Instructions**: Refine system instructions based on patterns
3. **Knowledge Pool Hygiene**: Periodically audit old corrections
4. **Performance Tracking**: Set targets (e.g., >80% first attempt success)
5. **User Training**: Train reviewers on effective labeling

---

## 📦 Files Modified/Created

### Database
- `admin-ui/prisma/schema.prisma` (modified)
- `admin-ui/prisma/migrations/20260212_add_human_review_system/migration.sql` (created)

### Backend APIs
- `admin-ui/app/api/calls/review/route.ts` (created)
- `admin-ui/app/api/calls/[id]/labels/route.ts` (created)
- `admin-ui/app/api/knowledge-pool/route.ts` (created)
- `admin-ui/app/api/analytics/attempts/route.ts` (created)

### Frontend UI
- `admin-ui/app/(app)/voiceagents/[id]/layout.tsx` (modified - added Human Review tab)
- `admin-ui/app/(app)/voiceagents/[id]/review/page.tsx` (created)
- `admin-ui/app/(app)/voiceagents/[id]/calls/[callId]/page.tsx` (modified - added attempt indicators)
- `admin-ui/app/(app)/voiceagents/[id]/page.tsx` (modified - added analytics dashboard)
- `admin-ui/components/analytics/AttemptsAnalytics.tsx` (created)

### Telephony Service
- `telephony/knowledge_pool.py` (created)
- `telephony/main.py` (modified - integrated knowledge pool)

---

## 🎉 Success Metrics

Track these KPIs to measure feature success:

1. **First Attempt Success Rate**: Target >80%
2. **Overall Capture Rate**: Target >90%
3. **Knowledge Pool Growth**: Aim for 50+ corrections/month
4. **Fields Needing Review**: Should decrease over time
5. **Data Quality Score**: Average should increase month-over-month

---

## 🔮 Future Enhancements

Potential improvements for future iterations:

1. **Auto-Review**: AI-suggested corrections for reviewer approval
2. **Bulk Operations**: Review multiple calls at once
3. **Export/Import**: Share knowledge pool between agents
4. **Phonetic Matching**: Smart suggestions based on phonetic similarity
5. **Voice Clips**: Audio playback for each field extraction
6. **Gamification**: Reward reviewers for quality labels
7. **A/B Testing**: Test knowledge pool impact on capture rates

---

## 📞 Support

For issues or questions:
- Check logs: `sudo journalctl -u kia-g25-telephony -f`
- Review database: `npx prisma studio`
- Contact: development team

---

**Version**: 1.0.0  
**Last Updated**: February 12, 2026  
**Author**: AI Development Team
