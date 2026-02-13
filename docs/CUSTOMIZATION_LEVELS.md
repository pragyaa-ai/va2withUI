# VA2withUI Customization Levels

This document explains the three levels of customization available when deploying va2withUI for a new customer.

## Table of Contents

1. [Overview](#overview)
2. [Level 1: Configuration Only](#level-1-configuration-only)
3. [Level 2: Domain Model Rename](#level-2-domain-model-rename)
4. [Level 3: Custom Schema](#level-3-custom-schema)
5. [Decision Matrix](#decision-matrix)
6. [Examples by Industry](#examples-by-industry)

---

## Overview

### Customization Pyramid

```
                    ┌─────────────────┐
                    │  Custom Schema  │  Most Flexible
                    │   (Level 3)     │  Most Complex
                    └─────────────────┘
                   ┌───────────────────┐
                   │  Domain Rename    │  Moderate
                   │    (Level 2)      │  Effort
                   └───────────────────┘
              ┌───────────────────────────┐
              │   Configuration Only      │  Quick
              │      (Level 1)            │  Simple
              └───────────────────────────┘
```

### Quick Selection Guide

| Question | Answer | Recommended Level |
|----------|--------|-------------------|
| Does your use case involve voice agents? | Yes | Continue |
| Do customers call to inquire about products/services? | Yes | Continue |
| Does the existing "car model catalog" concept fit your domain? | Yes, with renamed terminology | Level 2 |
| Does the existing "car model catalog" concept fit your domain? | Yes, as-is | Level 1 |
| Does your domain have completely different entities? | Yes | Level 3 |

---

## Level 1: Configuration Only

### What It Is

Use the base va2withUI schema without modifications. Only customize:
- Environment variables
- Customer branding
- Voice agent configurations
- User credentials

### When to Use

- **Your domain uses similar concepts** to automotive dealership
- You have a **catalog of items** (products, services, offerings)
- You have **locations or identifiers** (stores, branches, codes)
- You need **basic appointment or inquiry tracking**

### What You Can Customize

✅ **Environment & Branding**
- Customer name and logo
- Database names
- Port numbers
- GCP project settings

✅ **Voice Agents**
- Agent names and slugs
- Greeting messages
- System instructions
- Voice and language settings

✅ **Data Content**
- User credentials
- CarModel entries (your product catalog)
- VmnMapping entries (your location codes)
- Default settings

### What You CANNOT Customize

❌ Database schema (table/column names)
❌ API routes and endpoints
❌ Data model relationships
❌ Entity names in code

### Effort Required

- **Time**: 2-4 hours
- **Technical Skill**: Junior to Mid-level
- **Risk**: Low

### Example Use Cases

1. **Automotive Dealership** (exact fit)
   - Car models = Car models
   - Store codes = Dealership codes
   - Test drive appointments

2. **Motorcycle Showroom**
   - Car models = Bike models
   - Store codes = Showroom codes
   - Demo ride bookings

3. **Appliance Store Chain**
   - Car models = Appliance models
   - Store codes = Store locations
   - Product inquiries

### Deployment Steps

```bash
1. Clone repository
2. Configure environment files
3. Setup database
4. Seed with your data
5. Deploy services
```

See: [Quick Start section in DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md#quick-start-config-only)

---

## Level 2: Domain Model Rename

### What It Is

Rename existing entities and fields to match your domain terminology. The structure remains the same, but names change to fit your business.

### When to Use

- Your domain **structure matches** va2withUI but **terminology differs**
- You have a catalog of items (but not "cars")
- You have location identifiers (but not "store codes")
- You want clean, domain-appropriate terminology in UI and APIs

### What You Can Customize

✅ **Everything from Level 1, plus:**
- Database table names
- Database column names
- API route paths
- Frontend labels
- Variable names throughout codebase

### Common Renames

| Original | Healthcare Example | Hospitality Example | Real Estate Example |
|----------|-------------------|---------------------|---------------------|
| CarModel | DoctorProfile | RoomType | PropertyListing |
| modelName | doctorName | roomCategory | propertyName |
| vehicleType | specialization | bedConfiguration | propertyType |
| keyFeatures | qualifications | amenities | features |
| storeCode | hospitalCode | propertyCode | mlsNumber |
| VmnMapping | PhoneRouting | ReservationRouting | InquiryRouting |

### Effort Required

- **Time**: 1-2 days
- **Technical Skill**: Mid to Senior level
- **Risk**: Moderate (requires thorough testing)

### Challenges

1. **Consistency**: Must update schema, seed data, API routes, validation, and frontend
2. **Testing**: Need to verify all renamed fields work correctly
3. **Documentation**: Update any hardcoded examples or comments

### Tools Provided

- **schema_renamer.sh**: Automated utility for bulk renames
- **Mapping configuration**: JSON file defining old→new names
- **Validation checks**: Ensure TypeScript compilation succeeds

### Example: Automotive → Healthcare

**Before** (Automotive):
```prisma
model CarModel {
  id          String @id
  modelName   String
  vehicleType String
  keyFeatures String
}

model VmnMapping {
  vmn        String
  storeCode  String
}
```

**After** (Healthcare):
```prisma
model DoctorProfile {
  id             String @id
  doctorName     String
  specialization String
  qualifications String
}

model VmnMapping {
  vmn          String
  hospitalCode String
}
```

### Deployment Steps

```bash
1. Clone repository
2. Create mapping configuration (JSON)
3. Run schema_renamer.sh utility
4. Review and validate changes
5. Update seed data
6. Test TypeScript compilation
7. Deploy as usual
```

See: [Domain Model Deployment section in DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md#domain-model-deployment)

---

## Level 3: Custom Schema

### What It Is

Design a completely new data model for your specific requirements. Start with base authentication and voice agent models, then add custom entities.

### When to Use

- Your domain **doesn't fit** existing structure at all
- You need **different entities** than product catalog + locations
- You require **custom relationships** between entities
- You have **unique business logic** requirements

### What You Can Customize

✅ **Everything from Level 1 & 2, plus:**
- Add new database tables
- Define custom relationships
- Create new API endpoints
- Build custom frontend pages
- Implement domain-specific logic

### What You MUST Keep

⚠️ **Required Base Models** (for authentication):
- User
- Account
- Session
- VerificationToken

⚠️ **Required Core Model** (for voice agents):
- VoiceAgent (can extend with custom fields)
- CallSession (can extend with custom fields)

### Effort Required

- **Time**: 1-2 weeks
- **Technical Skill**: Senior level
- **Risk**: High (extensive custom code)

### Example: E-commerce Product Inquiry

**New Entities:**

```prisma
// Custom: Product catalog
model Product {
  id          String @id
  productName String
  sku         String @unique
  category    String
  price       Decimal
  stock       Int
  description String
}

// Custom: Customer inquiries
model ProductInquiry {
  id            String @id
  productId     String
  customerName  String
  customerPhone String
  quantity      Int
  status        InquiryStatus
  
  product       Product @relation(...)
}

enum InquiryStatus {
  PENDING
  CONTACTED
  CONVERTED
  CANCELLED
}
```

**New API Routes:**
- `/api/voiceagents/[id]/products`
- `/api/voiceagents/[id]/inquiries`
- `/api/voiceagents/[id]/inventory`

**New Frontend Pages:**
- Product management
- Inquiry dashboard
- Inventory tracking

### Deployment Steps

```bash
1. Clone repository
2. Design custom schema (start from template)
3. Create custom seed data
4. Build custom API routes
5. Create custom frontend pages
6. Implement business logic
7. Test thoroughly
8. Deploy
```

See: [Custom Schema Deployment section in DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md#custom-schema-deployment)

---

## Decision Matrix

### Choose Your Level

| Criteria | Level 1 | Level 2 | Level 3 |
|----------|---------|---------|---------|
| **Timeline** | Days | Days-Week | Weeks |
| **Developer Skill** | Junior | Mid-Senior | Senior |
| **Code Changes** | Minimal | Moderate | Extensive |
| **Risk Level** | Low | Moderate | High |
| **Maintenance** | Easy | Moderate | Complex |
| **Flexibility** | Limited | Moderate | Maximum |

### Decision Tree

```
Start
  │
  ├─ Does your domain have "catalog items" and "location codes"?
  │   │
  │   ├─ YES → Are the terms "car model" and "store code" acceptable?
  │   │   │
  │   │   ├─ YES → Level 1 (Config Only)
  │   │   └─ NO  → Level 2 (Domain Rename)
  │   │
  │   └─ NO → Do you need completely different entities?
  │       │
  │       ├─ YES → Level 3 (Custom Schema)
  │       └─ NO  → Reconsider if va2withUI fits your use case
  │
  └─ Not sure? → Start with Level 1, migrate later if needed
```

---

## Examples by Industry

### Automotive (Level 1 - Perfect Fit)
- **Entities**: Car models, dealership stores
- **Use Case**: Test drive bookings, model inquiries
- **Customization**: None needed, use as-is

### Healthcare (Level 2 - Domain Rename)
- **Before**: CarModel, storeCode
- **After**: DoctorProfile, hospitalCode
- **Use Case**: Doctor appointment booking
- **Customization**: Rename entities, same structure

### Hospitality (Level 2 - Domain Rename)
- **Before**: CarModel, storeCode
- **After**: RoomType, propertyCode
- **Use Case**: Hotel room inquiries and bookings
- **Customization**: Rename entities, same structure

### Real Estate (Level 2/3 - Hybrid)
- **Rename**: CarModel → PropertyListing
- **Add**: PropertyTour, OpenHouse, AgentAssignment
- **Use Case**: Property inquiries and tour scheduling
- **Customization**: Rename + add custom tables

### E-commerce (Level 3 - Custom Schema)
- **New Entities**: Product, Category, Inventory, Order
- **Use Case**: Product inquiries, stock checks, order tracking
- **Customization**: Complete new schema

### Education (Level 3 - Custom Schema)
- **New Entities**: Course, Instructor, Enrollment, Schedule
- **Use Case**: Course inquiries, enrollment assistance
- **Customization**: Complete new schema

### Financial Services (Level 3 - Custom Schema)
- **New Entities**: LoanProduct, Application, Document, Appointment
- **Use Case**: Loan inquiries, application assistance
- **Customization**: Complete new schema

---

## Migration Between Levels

### Can I Start Simple and Upgrade Later?

**Yes, but with caveats:**

✅ **Level 1 → Level 2**: Relatively easy
- Rename database tables and columns
- Update code references
- No data migration issues

⚠️ **Level 1 or 2 → Level 3**: Moderate difficulty
- May require data migration scripts
- Need to map old structure to new entities
- Risk of data loss if not planned carefully

❌ **Level 3 → Level 1 or 2**: Not recommended
- Would lose custom functionality
- Complex data migration
- Better to start fresh

### Recommendation

Start with the **simplest level that meets your needs**. It's easier to add complexity than to remove it.

---

## Best Practices

### For All Levels

1. **Plan First**: Understand your requirements before choosing
2. **Test Thoroughly**: Always test on staging before production
3. **Document Changes**: Keep track of customizations
4. **Backup Data**: Before any schema changes
5. **Version Control**: Commit each major change separately

### Level 1 Specific

- Keep detailed configuration documentation
- Use descriptive names in seed data
- Test with representative data

### Level 2 Specific

- Create mapping documentation (old → new names)
- Search entire codebase for old terminology
- Test all API endpoints after renaming
- Clear Next.js cache after schema changes

### Level 3 Specific

- Design schema on paper first
- Start with minimal viable schema
- Add features incrementally
- Write integration tests for custom logic
- Document custom API endpoints

---

## Getting Help

- See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for step-by-step instructions
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues
- Contact: support@pragyaa.ai
