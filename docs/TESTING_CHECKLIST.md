# VA2withUI Deployment System Testing Checklist

This checklist should be used to validate the deployment system on a clean VM for each customization level.

## Pre-Test Setup

### VM Requirements
- [ ] Fresh Ubuntu 22.04 LTS VM
- [ ] Minimum 4GB RAM, 20GB disk
- [ ] Public IP address
- [ ] SSH access
- [ ] sudo privileges

### Prerequisites Installation
- [ ] Git installed and working
- [ ] Node.js 18+ installed
- [ ] npm working
- [ ] Python 3.10+ installed
- [ ] pip3 working
- [ ] PostgreSQL 14+ installed and running
- [ ] GCP CLI installed (if testing GCP features)
- [ ] GCP credentials configured

## Test 1: Configuration Only Deployment

### Objective
Test the simplest deployment path with no customizations.

### Steps

1. **Clone Repository**
   ```bash
   git clone https://github.com/pragyaa-ai/va2withUI.git
   cd va2withUI
   ```
   - [ ] Repository clones successfully
   - [ ] All files present

2. **Run Deployment Script**
   ```bash
   bash deploy/setup_customer.sh
   ```
   - [ ] Pre-flight checks pass
   - [ ] Interactive prompts work correctly
   - [ ] Sensible defaults provided

3. **Provide Test Inputs**
   - Customer Name: Test Company
   - Customer Slug: testco
   - Select Level: 1 (Configuration Only)
   - [ ] Accepts all inputs
   - [ ] Validates slug format
   - [ ] Auto-generates passwords

4. **Monitor Deployment**
   - [ ] Database created successfully
   - [ ] Environment files generated
   - [ ] Dependencies installed (npm, pip)
   - [ ] Prisma client generated
   - [ ] Schema pushed to database
   - [ ] Database seeded
   - [ ] Next.js build succeeds
   - [ ] Systemd services created
   - [ ] Services start successfully

5. **Verify Deployment**
   - [ ] Database accessible: `psql -h 127.0.0.1 -U voiceagent_user -d testco_db`
   - [ ] Admin UI service running: `systemctl status testco-admin-ui`
   - [ ] Telephony service running: `systemctl status testco-telephony`
   - [ ] Admin UI port listening: `ss -tlnp | grep 3100`
   - [ ] Telephony port listening: `ss -tlnp | grep 8081`
   - [ ] HTTP response: `curl -I http://localhost:3100`

6. **Test Admin UI**
   - [ ] Access UI at http://VM_IP:3100
   - [ ] Login page loads
   - [ ] Can login with admin / OneView01!
   - [ ] Dashboard loads
   - [ ] Voice agents list is empty or has seed data

7. **Review Artifacts**
   - [ ] Deployment summary file created
   - [ ] Database credentials saved
   - [ ] Services enabled for auto-start
   - [ ] Logs are being written

### Success Criteria
- ✅ All steps complete without errors
- ✅ Services running and accessible
- ✅ Admin UI functional
- ✅ Can create new voice agent via UI

---

## Test 2: Domain Model Rename Deployment

### Objective
Test domain model rename with healthcare example (CarModel → DoctorProfile).

### Steps

1. **Prepare Clean VM**
   - [ ] Fresh VM or cleaned previous test
   - [ ] Prerequisites installed

2. **Clone Repository**
   ```bash
   git clone https://github.com/pragyaa-ai/va2withUI.git
   cd va2withUI
   ```

3. **Create Mapping Configuration**
   ```bash
   cat > /tmp/schema_mapping.json <<EOF
   {
     "tables": {
       "CarModel": "DoctorProfile"
     },
     "columns": {
       "CarModel.modelName": "DoctorProfile.doctorName",
       "VmnMapping.storeCode": "VmnMapping.hospitalCode"
     },
     "terminology": {
       "car model": "doctor",
       "store code": "hospital code"
     }
   }
   EOF
   ```
   - [ ] Mapping file created
   - [ ] JSON is valid

4. **Run Schema Renamer**
   ```bash
   bash deploy/utils/schema_renamer.sh /tmp/schema_mapping.json
   ```
   - [ ] Backups created
   - [ ] Schema updated
   - [ ] Seed file updated
   - [ ] API routes updated
   - [ ] Validation updated
   - [ ] Migration file created
   - [ ] TypeScript validation passes

5. **Verify Renames**
   - [ ] Check schema: `grep -n "DoctorProfile" admin-ui/prisma/schema.prisma`
   - [ ] Check seed: `grep -n "doctorName" admin-ui/prisma/seed.ts`
   - [ ] Check API: `grep -rn "hospitalCode" admin-ui/app/api/`
   - [ ] No old terms remain: `grep -rn "carModel\|storeCode" admin-ui/app/api/` (should be empty)

6. **Run Deployment Script**
   ```bash
   bash deploy/setup_customer.sh
   ```
   - Customer Name: Healthcare Test
   - Customer Slug: healthtest
   - Select Level: 1 (schema already renamed)
   - [ ] Deployment completes
   - [ ] TypeScript builds successfully

7. **Verify Healthcare Terminology**
   - [ ] Database has DoctorProfile table
   - [ ] VmnMapping has hospitalCode column
   - [ ] No CarModel table exists
   - [ ] API routes use new terminology

8. **Test Admin UI**
   - [ ] Can access UI
   - [ ] Login works
   - [ ] No references to "car model" or "store code" in UI

### Success Criteria
- ✅ Schema rename completes without errors
- ✅ No old terminology remains in codebase
- ✅ Deployment succeeds with renamed schema
- ✅ Database reflects new model names
- ✅ UI displays healthcare terminology

---

## Test 3: Custom Schema Deployment

### Objective
Test custom schema with e-commerce example.

### Steps

1. **Prepare Clean VM**
   - [ ] Fresh VM or cleaned previous tests
   - [ ] Prerequisites installed

2. **Clone Repository**
   ```bash
   git clone https://github.com/pragyaa-ai/va2withUI.git
   cd va2withUI
   ```

3. **Run Deployment Script**
   ```bash
   bash deploy/setup_customer.sh
   ```
   - Customer Name: E-commerce Test
   - Customer Slug: ecomtest
   - Select Level: 3 (Custom Schema)
   - [ ] Templates copied to admin-ui/prisma/

4. **Customize Schema**
   Edit `admin-ui/prisma/schema.prisma`:
   ```prisma
   model Product {
     id            String   @id @default(cuid())
     voiceAgentId  String
     productName   String
     sku           String   @unique
     price         Decimal  @db.Decimal(10, 2)
     stock         Int
     voiceAgent    VoiceAgent @relation(fields: [voiceAgentId], references: [id])
   }
   ```
   - [ ] Schema customized
   - [ ] Syntax is valid

5. **Customize Seed**
   Edit `admin-ui/prisma/seed.ts`:
   ```typescript
   const PRODUCTS = [
     {
       productName: "Test Product",
       sku: "PROD-001",
       price: 99.99,
       stock: 100,
     },
   ];
   // Add seeding logic
   ```
   - [ ] Seed customized
   - [ ] Matches schema

6. **Continue Deployment**
   - [ ] Confirm schema customization when prompted
   - [ ] Deployment continues
   - [ ] Prisma generate succeeds
   - [ ] DB push succeeds
   - [ ] Seed runs successfully
   - [ ] Build completes

7. **Verify Custom Schema**
   - [ ] Product table exists in database
   - [ ] Seed data inserted
   - [ ] Prisma client includes Product model

8. **Test Admin UI**
   - [ ] UI loads
   - [ ] Login works
   - [ ] Base functionality works

### Success Criteria
- ✅ Custom schema deployment succeeds
- ✅ New tables created correctly
- ✅ Seed data inserted
- ✅ Prisma client generated with custom models
- ✅ Admin UI works with custom schema

---

## Test 4: Agent Creator Utility

### Objective
Test all three methods of creating voice agents.

### Method 1: SQL Generation

1. **Run Agent Creator**
   ```bash
   bash deploy/utils/agent_creator.sh sql
   ```
   - Number of agents: 2
   - [ ] Interactive prompts work
   - [ ] All fields collected
   - [ ] SQL file generated

2. **Review SQL File**
   - [ ] File exists in /tmp/
   - [ ] Contains valid SQL
   - [ ] Has INSERT statements
   - [ ] Has ON CONFLICT handling

3. **Apply SQL**
   ```bash
   psql -h 127.0.0.1 -U voiceagent_user -d YOUR_DB -f /tmp/create_agents_*.sql
   ```
   - [ ] SQL executes successfully
   - [ ] Agents created in database

4. **Verify in UI**
   - [ ] Agents appear in Admin UI
   - [ ] All fields correct

### Method 2: API Creation

1. **Ensure Admin UI Running**
   - [ ] Admin UI accessible at localhost:3100

2. **Run Agent Creator**
   ```bash
   bash deploy/utils/agent_creator.sh api
   ```
   - Admin URL: http://localhost:3100
   - Number of agents: 1
   - [ ] API calls succeed
   - [ ] Agent created

3. **Verify in UI**
   - [ ] Agent appears immediately
   - [ ] All fields correct

### Method 3: Seed File Append

1. **Backup Seed File**
   ```bash
   cp admin-ui/prisma/seed.ts admin-ui/prisma/seed.ts.test-backup
   ```

2. **Run Agent Creator**
   ```bash
   bash deploy/utils/agent_creator.sh seed
   ```
   - Number of agents: 1
   - [ ] Seed file updated
   - [ ] Backup created

3. **Review Seed File**
   - [ ] New agent code appended
   - [ ] Syntax is valid
   - [ ] Follows seed pattern

4. **Run Seed**
   ```bash
   cd admin-ui
   npx prisma db seed
   ```
   - [ ] Seed runs successfully
   - [ ] Agent created

5. **Verify in UI**
   - [ ] Agent appears
   - [ ] All fields correct

### Success Criteria
- ✅ All three methods work
- ✅ Agents created correctly via each method
- ✅ Interactive prompts user-friendly
- ✅ Generated code/SQL is valid

---

## Test 5: Service Management

### Objective
Test systemd service functionality.

### Steps

1. **Check Service Status**
   ```bash
   systemctl status SLUG-admin-ui
   systemctl status SLUG-telephony
   ```
   - [ ] Both services running
   - [ ] No errors in status

2. **Test Service Restart**
   ```bash
   sudo systemctl restart SLUG-admin-ui
   sleep 5
   systemctl status SLUG-admin-ui
   ```
   - [ ] Service restarts cleanly
   - [ ] Admin UI accessible after restart

3. **Test Auto-Restart**
   - [ ] Kill admin UI process manually
   - [ ] Wait 15 seconds
   - [ ] Check if service restarted automatically
   - [ ] Service is running again

4. **Test Boot Persistence**
   ```bash
   sudo reboot
   # After reboot
   systemctl status SLUG-admin-ui
   systemctl status SLUG-telephony
   ```
   - [ ] Services start on boot
   - [ ] Admin UI accessible after reboot

5. **Check Logs**
   ```bash
   journalctl -u SLUG-admin-ui -n 50
   journalctl -u SLUG-telephony -n 50
   ```
   - [ ] Logs are being written
   - [ ] No critical errors

### Success Criteria
- ✅ Services restart automatically
- ✅ Services survive reboots
- ✅ Logs accessible via journalctl
- ✅ No memory leaks over time

---

## Test 6: Rollback Procedures

### Objective
Test rollback capabilities.

### Steps

1. **Create Backup**
   ```bash
   pg_dump -h 127.0.0.1 -U voiceagent_user DB_NAME > /tmp/backup.sql
   ```
   - [ ] Backup created successfully

2. **Make Breaking Change**
   - [ ] Modify schema in breaking way
   - [ ] Note current state

3. **Execute Rollback**
   ```bash
   sudo systemctl stop SLUG-admin-ui SLUG-telephony
   dropdb -h 127.0.0.1 -U voiceagent_user DB_NAME
   createdb -h 127.0.0.1 -U voiceagent_user DB_NAME
   psql -h 127.0.0.1 -U voiceagent_user DB_NAME < /tmp/backup.sql
   sudo systemctl start SLUG-admin-ui SLUG-telephony
   ```
   - [ ] Rollback completes
   - [ ] Database restored
   - [ ] Services running

4. **Verify Restoration**
   - [ ] Admin UI loads
   - [ ] Data is restored
   - [ ] No data loss

### Success Criteria
- ✅ Backup/restore works
- ✅ No data corruption
- ✅ Services recover cleanly

---

## Test 7: Error Handling

### Objective
Test how the system handles various error conditions.

### Scenarios to Test

1. **Missing Prerequisite**
   - [ ] Uninstall Node.js
   - [ ] Run deployment script
   - [ ] Clear error message shown
   - [ ] Script exits gracefully

2. **Database Connection Failure**
   - [ ] Stop PostgreSQL
   - [ ] Run deployment
   - [ ] Error detected and reported

3. **Port Already in Use**
   - [ ] Start something on port 3100
   - [ ] Run deployment
   - [ ] Conflict detected

4. **Invalid Input**
   - [ ] Enter invalid slug (spaces, special chars)
   - [ ] Validation catches it
   - [ ] Re-prompts for correct input

5. **Build Failure**
   - [ ] Introduce TypeScript error
   - [ ] Run deployment
   - [ ] Build fails gracefully
   - [ ] Error message helpful

### Success Criteria
- ✅ All errors caught and reported
- ✅ Error messages are helpful
- ✅ Script doesn't leave system in broken state
- ✅ Can recover from errors

---

## Final Validation

### Overall System Health

- [ ] All three customization levels deploy successfully
- [ ] Agent creator works for all methods
- [ ] Services are stable over 24 hours
- [ ] No memory leaks detected
- [ ] Logs don't show recurring errors
- [ ] Performance is acceptable
- [ ] Documentation is accurate

### Performance Benchmarks

- [ ] Deployment time: < 15 minutes (config only)
- [ ] Admin UI response time: < 1 second
- [ ] Database queries: < 100ms
- [ ] Memory usage: < 1GB per service

### Security Checks

- [ ] No passwords in git
- [ ] Environment files gitignored
- [ ] Services run as non-root user
- [ ] Database uses secure password
- [ ] Firewall configured correctly

---

## Test Report Template

After completing tests, document results:

```markdown
# Deployment System Test Report

**Date**: YYYY-MM-DD
**Tester**: Name
**VM**: Ubuntu 22.04 LTS, 4GB RAM, 20GB disk

## Test Results

### Level 1: Configuration Only
- Status: ✅ Pass / ❌ Fail
- Time: XX minutes
- Issues: None / List issues
- Notes: ...

### Level 2: Domain Rename
- Status: ✅ Pass / ❌ Fail
- Time: XX minutes
- Issues: ...
- Notes: ...

### Level 3: Custom Schema
- Status: ✅ Pass / ❌ Fail
- Time: XX minutes
- Issues: ...
- Notes: ...

### Agent Creator
- SQL Method: ✅ Pass / ❌ Fail
- API Method: ✅ Pass / ❌ Fail
- Seed Method: ✅ Pass / ❌ Fail

### Service Management
- Status: ✅ Pass / ❌ Fail
- Issues: ...

### Rollback
- Status: ✅ Pass / ❌ Fail
- Issues: ...

### Error Handling
- Status: ✅ Pass / ❌ Fail
- Issues: ...

## Overall Assessment

- **Pass**: All tests passed
- **Partial**: Some issues found (list)
- **Fail**: Critical issues (list)

## Recommendations

1. ...
2. ...

## Follow-up Actions

- [ ] Fix issue #1
- [ ] Update documentation
- [ ] Re-test after fixes
```

---

## Notes

- Test on completely fresh VM for each major test
- Document any deviations from expected behavior
- Time each deployment for performance tracking
- Keep detailed logs of any errors encountered
- Update TROUBLESHOOTING.md with new issues found
