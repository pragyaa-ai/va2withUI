# VA2withUI Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start (Config Only)](#quick-start-config-only)
3. [Domain Model Deployment](#domain-model-deployment)
4. [Custom Schema Deployment](#custom-schema-deployment)
5. [Post-Deployment Verification](#post-deployment-verification)
6. [Rollback Procedures](#rollback-procedures)

---

## Prerequisites

### System Requirements

- **Operating System**: Ubuntu 22.04 LTS or later
- **RAM**: Minimum 4GB (8GB recommended)
- **Disk Space**: Minimum 20GB free
- **Network**: Public IP address and firewall access to required ports

### Software Dependencies

#### 1. PostgreSQL 14+

```bash
# Install PostgreSQL
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# Start and enable service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify installation
psql --version
```

#### 2. Node.js 18+

```bash
# Install Node.js via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18

# Verify installation
node --version
npm --version
```

#### 3. Python 3.10+

```bash
# Install Python and pip
sudo apt install -y python3 python3-pip python3-venv

# Verify installation
python3 --version
pip3 --version
```

#### 4. Git

```bash
# Install Git
sudo apt install -y git

# Verify installation
git --version
```

### GCP Configuration (if deploying on GCP)

```bash
# Install Google Cloud SDK
curl https://sdk.cloud.google.com | bash
exec -l $SHELL

# Authenticate
gcloud auth login
gcloud auth application-default login

# Set project
gcloud config set project YOUR_PROJECT_ID
```

---

## Quick Start (Config Only)

This deployment method uses the base schema without modifications. Ideal for customers who fit the existing domain model.

### Step 1: Clone Repository

```bash
# Define customer slug (lowercase, alphanumeric, dashes/underscores)
export CUSTOMER_SLUG="rxone"
export DEPLOY_PATH="/opt/${CUSTOMER_SLUG}"

# Create deployment directory with correct permissions
sudo mkdir -p ${DEPLOY_PATH}
sudo chown -R $USER:$USER ${DEPLOY_PATH}

# Clone base repository
cd /opt
git clone https://github.com/pragyaa-ai/va2withUI.git ${CUSTOMER_SLUG}
cd ${CUSTOMER_SLUG}
```

### Step 2: Setup Database

```bash
# Generate secure password
export DB_PASSWORD=$(openssl rand -base64 24)
echo "Database Password: ${DB_PASSWORD}" | tee ~/db_credentials.txt

# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE ${CUSTOMER_SLUG}_db;
CREATE USER voiceagent_user WITH PASSWORD '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON DATABASE ${CUSTOMER_SLUG}_db TO voiceagent_user;
\c ${CUSTOMER_SLUG}_db
GRANT ALL ON SCHEMA public TO voiceagent_user;
ALTER DATABASE ${CUSTOMER_SLUG}_db OWNER TO voiceagent_user;

-- Create shadow database for Prisma migrations
CREATE DATABASE ${CUSTOMER_SLUG}_shadow;
GRANT ALL PRIVILEGES ON DATABASE ${CUSTOMER_SLUG}_shadow TO voiceagent_user;
ALTER DATABASE ${CUSTOMER_SLUG}_shadow OWNER TO voiceagent_user;
EOF
```

### Step 3: Configure Environment

**Admin UI Environment (.env for Prisma CLI)**:

```bash
cat > admin-ui/.env << EOF
DATABASE_URL="postgresql://voiceagent_user:${DB_PASSWORD}@127.0.0.1:5432/${CUSTOMER_SLUG}_db"
SHADOW_DATABASE_URL="postgresql://voiceagent_user:${DB_PASSWORD}@127.0.0.1:5432/${CUSTOMER_SLUG}_shadow"
EOF
```

**Admin UI Environment (.env.local for Next.js)**:

```bash
# Get external IP (for GCP)
export EXTERNAL_IP=$(curl -s ifconfig.me)

# Generate NextAuth secret
export NEXTAUTH_SECRET=$(openssl rand -base64 32)

cat > admin-ui/.env.local << EOF
# Database
DATABASE_URL="postgresql://voiceagent_user:${DB_PASSWORD}@127.0.0.1:5432/${CUSTOMER_SLUG}_db"
SHADOW_DATABASE_URL="postgresql://voiceagent_user:${DB_PASSWORD}@127.0.0.1:5432/${CUSTOMER_SLUG}_shadow"

# NextAuth
NEXTAUTH_URL="http://${EXTERNAL_IP}:3100"
NEXTAUTH_SECRET="${NEXTAUTH_SECRET}"

# Customer Branding
NEXT_PUBLIC_CUSTOMER_NAME="RxOne Healthcare"
EOF
```

**Telephony Service Environment**:

```bash
cat > telephony/.env << EOF
# Server Configuration
HOST=0.0.0.0
PORT=8081
WS_PATH=/ws

# Google Cloud / Gemini
GCP_PROJECT_ID=YOUR_PROJECT_ID
GEMINI_LOCATION=us-central1
GEMINI_MODEL=gemini-live-2.5-flash-native-audio
GEMINI_VOICE=ANANYA

# Audio Settings
TELEPHONY_SR=8000
GEMINI_INPUT_SR=16000
GEMINI_OUTPUT_SR=24000
AUDIO_BUFFER_MS_INPUT=100
AUDIO_BUFFER_MS_OUTPUT=100

# Data Storage
DATA_BASE_DIR=/data
ENABLE_DATA_STORAGE=true

# Admin UI Integration
ADMIN_API_BASE=http://127.0.0.1:3100
EOF
```

### Step 4: Install Dependencies

```bash
# Admin UI
cd admin-ui
npm install

# Telephony Service
cd ../telephony
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate
cd ..
```

### Step 5: Initialize Database

```bash
cd admin-ui

# Generate Prisma client
npx prisma generate

# Push schema to database (blank DB approach)
npx prisma db push

# Seed database with default data
npx prisma db seed
```

### Step 6: Build Application

```bash
# Build Next.js application
npm run build
```

### Step 7: Setup Systemd Services

**Admin UI Service**:

```bash
sudo tee /etc/systemd/system/${CUSTOMER_SLUG}-admin-ui.service > /dev/null << EOF
[Unit]
Description=${CUSTOMER_SLUG} Admin UI (Next.js)
After=network.target postgresql.service

[Service]
Type=simple
User=$USER
WorkingDirectory=${DEPLOY_PATH}/admin-ui
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm start -- -p 3100
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

**Telephony Service**:

```bash
sudo tee /etc/systemd/system/${CUSTOMER_SLUG}-telephony.service > /dev/null << EOF
[Unit]
Description=${CUSTOMER_SLUG} Telephony Service
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=${DEPLOY_PATH}/telephony
Environment="PATH=${DEPLOY_PATH}/telephony/venv/bin"
Environment="GOOGLE_APPLICATION_CREDENTIALS=/home/$USER/.config/gcloud/application_default_credentials.json"
ExecStart=${DEPLOY_PATH}/telephony/venv/bin/python main.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
```

**Enable and Start Services**:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable services
sudo systemctl enable ${CUSTOMER_SLUG}-admin-ui
sudo systemctl enable ${CUSTOMER_SLUG}-telephony

# Start services
sudo systemctl start ${CUSTOMER_SLUG}-admin-ui
sudo systemctl start ${CUSTOMER_SLUG}-telephony

# Check status
sudo systemctl status ${CUSTOMER_SLUG}-admin-ui
sudo systemctl status ${CUSTOMER_SLUG}-telephony
```

### Step 8: Configure Firewall (GCP)

```bash
# Allow Admin UI port
gcloud compute firewall-rules create allow-${CUSTOMER_SLUG}-admin-ui \
  --allow=tcp:3100 \
  --source-ranges=0.0.0.0/0 \
  --description="Allow ${CUSTOMER_SLUG} Admin UI access"

# Allow Telephony port
gcloud compute firewall-rules create allow-${CUSTOMER_SLUG}-telephony \
  --allow=tcp:8081 \
  --source-ranges=0.0.0.0/0 \
  --description="Allow ${CUSTOMER_SLUG} Telephony access"
```

### Step 9: Verify Deployment

```bash
# Check Admin UI
curl -I http://localhost:3100

# Check Telephony
curl http://localhost:8081/health

# Access Admin UI
echo "Admin UI: http://${EXTERNAL_IP}:3100"
echo "Default credentials:"
echo "  Username: admin"
echo "  Password: OneView01!"
```

---

## Domain Model Deployment

This deployment method renames existing entities to match customer domain (e.g., CarModel → DoctorProfile).

### When to Use

- Customer use case fits existing structure but uses different terminology
- Examples: Automotive → Healthcare, Retail → Hospitality
- Minimal schema changes, mostly renaming

### Step 1-3: Same as Quick Start

Follow Steps 1-3 from Quick Start section above.

### Step 4: Customize Schema

#### Option A: Manual Customization

Edit `admin-ui/prisma/schema.prisma`:

**Example: Automotive → Healthcare**

```prisma
// Before: CarModel
model DoctorProfile {
  id            String      @id @default(cuid())
  voiceAgentId  String
  doctorName    String      // Was: modelName
  pronunciation String?
  phonetic      String?
  specialization String?    // Was: vehicleType
  qualifications String?    // Was: keyFeatures
  displayOrder  Int         @default(0)
  isActive      Boolean     @default(true)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  voiceAgent    VoiceAgent  @relation(fields: [voiceAgentId], references: [id], onDelete: Cascade)

  @@unique([voiceAgentId, doctorName])
  @@index([voiceAgentId])
}

// Update VoiceAgent relation
model VoiceAgent {
  // ...other fields...
  doctorProfiles DoctorProfile[]  // Was: carModels
}

// Update VmnMapping
model VmnMapping {
  id            String      @id @default(cuid())
  voiceAgentId  String
  vmn           String
  hospitalCode  String      // Was: storeCode
  effectiveFrom DateTime    @default(now())
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  voiceAgent    VoiceAgent  @relation(fields: [voiceAgentId], references: [id], onDelete: Cascade)

  @@unique([voiceAgentId, vmn])
  @@index([vmn])
}
```

#### Option B: Use Schema Renamer Utility

```bash
# Create mapping configuration
cat > /tmp/schema_mapping.json << EOF
{
  "tables": {
    "CarModel": "DoctorProfile",
    "VmnMapping": "VmnMapping"
  },
  "columns": {
    "CarModel.modelName": "DoctorProfile.doctorName",
    "CarModel.vehicleType": "DoctorProfile.specialization",
    "CarModel.keyFeatures": "DoctorProfile.qualifications",
    "VmnMapping.storeCode": "VmnMapping.hospitalCode"
  },
  "relations": {
    "VoiceAgent.carModels": "VoiceAgent.doctorProfiles"
  },
  "terminology": {
    "car model": "doctor",
    "Car Model": "Doctor",
    "car models": "doctors",
    "store code": "hospital code",
    "Store Code": "Hospital Code"
  }
}
EOF

# Run schema renamer utility
bash deploy/utils/schema_renamer.sh /tmp/schema_mapping.json
```

### Step 5: Update Seed Data

Edit `admin-ui/prisma/seed.ts`:

```typescript
// Update user emails
const USERS = [
  {
    username: "admin",
    password: "OneView01!",
    name: "Admin User",
    email: "admin@rxone.healthcare",  // Updated
    role: "ADMIN" as const,
    customerSlug: "rxone",
  },
  {
    username: "user",
    password: "VoiceAgent01!",
    name: "RxOne User",  // Updated
    email: "user@rxone.healthcare",  // Updated
    role: "USER" as const,
    customerSlug: "rxone",
  },
];

// Update VMN mappings
const VMN_HOSPITAL_CODE_MAP: Record<string, string> = {  // Was: VMN_STORE_CODE_MAP
  "+919167246028": "ARTEMIS_GGN",  // Was: "GJ311"
  // ... add more mappings
};

// Seed hospital mappings
for (const [vmn, hospitalCode] of Object.entries(VMN_HOSPITAL_CODE_MAP)) {
  await prisma.vmnMapping.upsert({
    where: {
      voiceAgentId_vmn: { voiceAgentId: agent.id, vmn }
    },
    update: { hospitalCode },
    create: {
      voiceAgentId: agent.id,
      vmn,
      hospitalCode,
    },
  });
}

// Update doctor profiles (was: car models)
const DOCTOR_PROFILES = [  // Was: KIA_CAR_MODELS
  {
    doctorName: "Dr. Seema Dhir",  // Was: modelName: "SELTOS"
    pronunciation: "Dr. SEE-ma DEER",
    specialization: "Internal Medicine",  // Was: vehicleType
    qualifications: "MBBS, MD - 20+ years experience",  // Was: keyFeatures
    displayOrder: 0,
  },
  // ... add more doctors
];

// Seed doctor profiles
for (const profile of DOCTOR_PROFILES) {
  await prisma.doctorProfile.upsert({  // Was: carModel
    where: {
      voiceAgentId_doctorName: {  // Was: voiceAgentId_modelName
        voiceAgentId: agent.id,
        doctorName: profile.doctorName,
      }
    },
    update: { ...profile },
    create: {
      voiceAgentId: agent.id,
      ...profile,
    },
  });
}
```

### Step 6: Update API Routes

Update validation schemas in `admin-ui/src/lib/validation.ts`:

```typescript
// Update VMN mapping schema
export const createVmnMappingSchema = z.object({
  vmn: z.string().min(1, "VMN is required").max(20).regex(/^\+?\d+$/, "VMN must be a valid phone number"),
  hospitalCode: z.string().min(1, "Hospital code is required").max(20),  // Was: storeCode
});

// Update doctor profile schema (was: car model)
export const createDoctorProfileSchema = z.object({  // Was: createCarModelSchema
  doctorName: z.string().min(1, "Doctor name is required").max(100),  // Was: modelName
  pronunciation: z.string().max(100).optional(),
  phonetic: z.string().max(100).optional(),
  specialization: z.string().max(100).optional(),  // Was: vehicleType
  qualifications: z.string().max(2000).optional(),  // Was: keyFeatures
  displayOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
```

Update API route files:

```bash
# Rename directory
mv admin-ui/app/api/voiceagents/[id]/car-models admin-ui/app/api/voiceagents/[id]/doctor-profiles

# Update route files to use new terminology
# Use sed or manual editing for:
# - app/api/telephony/prompt/[slug]/route.ts
# - app/api/calls/ingest/route.ts
# - app/api/voiceagents/[id]/analytics/route.ts
# - app/api/voiceagents/[id]/calls/route.ts
# - app/api/voiceagents/[id]/vmn-mappings/route.ts
```

### Step 7: Update Frontend (if needed)

Update form components in `admin-ui/app/(app)/voiceagents/`:

```typescript
// Example: Update labels in VMN mapping form
<Input
  label="Hospital Code"  // Was: "Store Code"
  name="hospitalCode"
  placeholder="e.g., ARTEMIS_GGN"
/>
```

### Step 8-9: Same as Quick Start

Follow Steps 4-9 from Quick Start section (Install Dependencies, Initialize Database, Build, Setup Services, Configure Firewall, Verify).

**Important**: After schema changes, always:

```bash
# Regenerate Prisma client
npx prisma generate

# Clear Next.js cache
rm -rf .next

# Rebuild application
npm run build
```

---

## Custom Schema Deployment

This deployment method designs a completely new schema for customer-specific requirements.

### When to Use

- Customer use case doesn't fit existing domain model
- Requires new entities, relationships, and business logic
- Examples: E-commerce, Education, Real Estate

### Step 1-3: Same as Quick Start

Follow Steps 1-3 from Quick Start section.

### Step 4: Design Custom Schema

Start with base template:

```bash
# Copy base schema as starting point
cp admin-ui/prisma/schema.prisma admin-ui/prisma/schema.prisma.original

# Use schema template
cp deploy/templates/schema_template.prisma admin-ui/prisma/schema.prisma
```

Edit `admin-ui/prisma/schema.prisma` to add custom models:

**Example: E-commerce Product Inquiry System**

```prisma
// Keep base authentication models (User, Account, Session, VerificationToken)
// Keep base VoiceAgent model

// Custom: Product Catalog
model Product {
  id            String      @id @default(cuid())
  voiceAgentId  String
  productName   String
  sku           String      @unique
  category      String
  price         Decimal     @db.Decimal(10, 2)
  stock         Int
  description   String?     @db.Text
  features      String?     @db.Text
  isActive      Boolean     @default(true)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  voiceAgent    VoiceAgent  @relation(fields: [voiceAgentId], references: [id], onDelete: Cascade)
  inquiries     ProductInquiry[]

  @@index([voiceAgentId])
  @@index([category])
}

// Custom: Customer Inquiry Tracking
model ProductInquiry {
  id            String      @id @default(cuid())
  voiceAgentId  String
  productId     String
  callSessionId String?
  customerName  String
  customerEmail String?
  customerPhone String
  quantity      Int         @default(1)
  status        InquiryStatus @default(PENDING)
  notes         String?     @db.Text
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  voiceAgent    VoiceAgent  @relation(fields: [voiceAgentId], references: [id], onDelete: Cascade)
  product       Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  callSession   CallSession? @relation(fields: [callSessionId], references: [id], onDelete: SetNull)

  @@index([voiceAgentId])
  @@index([productId])
  @@index([status])
}

enum InquiryStatus {
  PENDING
  CONTACTED
  CONVERTED
  CANCELLED
}

// Update VoiceAgent to include new relations
model VoiceAgent {
  // ... existing fields ...
  products      Product[]
  inquiries     ProductInquiry[]
}
```

### Step 5: Create Custom Seed Data

Edit `admin-ui/prisma/seed.ts`:

```typescript
// Add custom seed data for products
const PRODUCTS = [
  {
    productName: "Wireless Headphones Pro",
    sku: "WHP-001",
    category: "Electronics",
    price: new Decimal(299.99),
    stock: 50,
    description: "Premium wireless headphones with noise cancellation",
    features: "- Active Noise Cancellation\n- 30-hour battery life\n- Bluetooth 5.0",
  },
  // ... more products
];

// Seed products
for (const productData of PRODUCTS) {
  await prisma.product.create({
    data: {
      voiceAgentId: agent.id,
      ...productData,
    },
  });
}
```

### Step 6: Create Custom API Routes

Create new API routes for custom entities:

```bash
# Create product API routes
mkdir -p admin-ui/app/api/voiceagents/[id]/products
```

**admin-ui/app/api/voiceagents/[id]/products/route.ts**:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const createProductSchema = z.object({
  productName: z.string().min(1).max(200),
  sku: z.string().min(1).max(50),
  category: z.string().min(1).max(100),
  price: z.number().positive(),
  stock: z.number().int().min(0),
  description: z.string().optional(),
  features: z.string().optional(),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const products = await prisma.product.findMany({
    where: { voiceAgentId: params.id },
    orderBy: { productName: "asc" },
  });
  return NextResponse.json(products);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json();
    const data = createProductSchema.parse(body);

    const product = await prisma.product.create({
      data: {
        voiceAgentId: params.id,
        ...data,
      },
    });

    return NextResponse.json(product);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to create product" },
      { status: 400 }
    );
  }
}
```

### Step 7: Update Frontend

Create new pages for managing custom entities:

```bash
# Create product management page
mkdir -p admin-ui/app/(app)/voiceagents/[id]/products
```

**admin-ui/app/(app)/voiceagents/[id]/products/page.tsx**:

```typescript
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

export default function ProductsPage() {
  const params = useParams();
  const [products, setProducts] = useState([]);

  useEffect(() => {
    fetch(`/api/voiceagents/${params.id}/products`)
      .then(res => res.json())
      .then(setProducts);
  }, [params.id]);

  return (
    <div>
      <h1>Products</h1>
      {/* Product list and management UI */}
    </div>
  );
}
```

### Step 8-9: Same as Quick Start

Follow Steps 4-9 from Quick Start section (Install Dependencies, Initialize Database, Build, Setup Services, Configure Firewall, Verify).

---

## Post-Deployment Verification

### Automated Verification Script

```bash
#!/bin/bash

echo "=========================================="
echo "Post-Deployment Verification"
echo "=========================================="

# Check database connectivity
echo -n "Database connectivity... "
if psql -h 127.0.0.1 -U voiceagent_user -d ${CUSTOMER_SLUG}_db -c "SELECT COUNT(*) FROM \"User\";" > /dev/null 2>&1; then
  echo "✓ PASS"
else
  echo "✗ FAIL"
fi

# Check Admin UI service
echo -n "Admin UI service... "
if systemctl is-active --quiet ${CUSTOMER_SLUG}-admin-ui; then
  echo "✓ RUNNING"
else
  echo "✗ STOPPED"
fi

# Check Telephony service
echo -n "Telephony service... "
if systemctl is-active --quiet ${CUSTOMER_SLUG}-telephony; then
  echo "✓ RUNNING"
else
  echo "✗ STOPPED"
fi

# Check Admin UI port
echo -n "Admin UI port 3100... "
if ss -tlnp | grep -q ":3100"; then
  echo "✓ LISTENING"
else
  echo "✗ NOT LISTENING"
fi

# Check Telephony port
echo -n "Telephony port 8081... "
if ss -tlnp | grep -q ":8081"; then
  echo "✓ LISTENING"
else
  echo "✗ NOT LISTENING"
fi

# Check Admin UI HTTP response
echo -n "Admin UI HTTP... "
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3100 | grep -q "200\|307"; then
  echo "✓ RESPONDING"
else
  echo "✗ NOT RESPONDING"
fi

echo "=========================================="
echo "Verification Complete"
echo "=========================================="
```

### Manual Verification Checklist

- [ ] Database created and accessible
- [ ] Admin UI service running
- [ ] Telephony service running
- [ ] Admin UI accessible via browser
- [ ] Can login with default credentials
- [ ] Voice agents visible in dashboard
- [ ] Systemd services start on boot
- [ ] Logs are being written
- [ ] External IP access works (if applicable)

---

## Rollback Procedures

### Database Rollback

```bash
# Backup current database
pg_dump -h 127.0.0.1 -U voiceagent_user ${CUSTOMER_SLUG}_db > /tmp/${CUSTOMER_SLUG}_backup_$(date +%Y%m%d_%H%M%S).sql

# Drop and recreate if needed
sudo -u postgres psql << EOF
DROP DATABASE ${CUSTOMER_SLUG}_db;
CREATE DATABASE ${CUSTOMER_SLUG}_db;
GRANT ALL PRIVILEGES ON DATABASE ${CUSTOMER_SLUG}_db TO voiceagent_user;
EOF

# Restore from backup
psql -h 127.0.0.1 -U voiceagent_user ${CUSTOMER_SLUG}_db < /tmp/${CUSTOMER_SLUG}_backup_TIMESTAMP.sql
```

### Service Rollback

```bash
# Stop services
sudo systemctl stop ${CUSTOMER_SLUG}-admin-ui
sudo systemctl stop ${CUSTOMER_SLUG}-telephony

# Restore previous version
cd ${DEPLOY_PATH}
git checkout previous-commit-hash

# Reinstall dependencies
cd admin-ui
npm install
npm run build

# Restart services
sudo systemctl start ${CUSTOMER_SLUG}-admin-ui
sudo systemctl start ${CUSTOMER_SLUG}-telephony
```

### Complete System Rollback

```bash
# Stop and disable services
sudo systemctl stop ${CUSTOMER_SLUG}-admin-ui ${CUSTOMER_SLUG}-telephony
sudo systemctl disable ${CUSTOMER_SLUG}-admin-ui ${CUSTOMER_SLUG}-telephony

# Remove systemd service files
sudo rm /etc/systemd/system/${CUSTOMER_SLUG}-admin-ui.service
sudo rm /etc/systemd/system/${CUSTOMER_SLUG}-telephony.service
sudo systemctl daemon-reload

# Drop databases
sudo -u postgres psql << EOF
DROP DATABASE IF EXISTS ${CUSTOMER_SLUG}_db;
DROP DATABASE IF EXISTS ${CUSTOMER_SLUG}_shadow;
EOF

# Remove deployment directory
sudo rm -rf ${DEPLOY_PATH}
```

---

## Support and Troubleshooting

For common issues and solutions, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

For customization guidance, see [CUSTOMIZATION_LEVELS.md](CUSTOMIZATION_LEVELS.md).
