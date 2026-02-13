# VA2withUI Deployment Tools

This directory contains automation scripts and templates for deploying va2withUI for new customers.

## Directory Structure

```
deploy/
├── README.md                          # This file
├── setup_customer.sh                  # Main deployment script
├── templates/                         # Configuration templates
│   ├── schema_template.prisma         # Prisma schema template
│   ├── seed_template.ts               # Seed data template
│   ├── env_admin_ui.template          # Admin UI environment template
│   ├── env_telephony.template         # Telephony environment template
│   ├── systemd_admin_ui.service.template    # Admin UI service template
│   └── systemd_telephony.service.template   # Telephony service template
├── utils/                             # Utility scripts
│   ├── schema_renamer.sh              # Automate domain model renames
│   └── agent_creator.sh               # Create voice agents
└── config/                            # Customer configurations
```

## Quick Start

### Basic Deployment (Configuration Only)

```bash
# Run the main deployment script
bash deploy/setup_customer.sh

# Follow the prompts to:
# 1. Enter customer information
# 2. Configure database
# 3. Setup GCP/Telephony
# 4. Select customization level (choose 1 for basic)
# 5. Deploy and verify
```

### Domain Model Rename Deployment

```bash
# 1. Run deployment script and select level 2
bash deploy/setup_customer.sh

# 2. Create mapping configuration
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

# 3. Run schema renamer
bash deploy/utils/schema_renamer.sh /tmp/schema_mapping.json

# 4. Regenerate Prisma client and build
cd admin-ui
npx prisma generate
rm -rf .next
npm run build
```

### Custom Schema Deployment

```bash
# 1. Run deployment script and select level 3
bash deploy/setup_customer.sh

# 2. Edit custom schema and seed files
#    (Script will copy templates automatically)
vim admin-ui/prisma/schema.prisma
vim admin-ui/prisma/seed.ts

# 3. Continue with deployment
```

## Main Deployment Script

### Usage

```bash
bash deploy/setup_customer.sh
```

### What It Does

1. **Pre-flight Checks**: Validates all prerequisites
2. **Customer Info**: Collects customer name, slug, domain, etc.
3. **Database Setup**: Creates PostgreSQL databases and users
4. **GCP Configuration**: Sets up Google Cloud and Gemini settings
5. **Customization**: Applies schema customizations based on level
6. **Environment Files**: Generates .env files from templates
7. **Dependencies**: Installs npm and Python packages
8. **Database Init**: Runs Prisma migrations and seed data
9. **Build**: Compiles Next.js application
10. **Services**: Creates and starts systemd services
11. **Firewall**: Configures GCP firewall rules (optional)
12. **Verification**: Tests all components
13. **Summary**: Generates deployment report

### Example Run

```
$ bash deploy/setup_customer.sh

============================================
VA2withUI Customer Deployment
============================================

Customer Name []: RxOne Healthcare
Customer Slug []: rxone
Customer Domain [rxone.com]: rxone.healthcare
Deployment Path [/opt/rxone]: 
External IP [34.93.20.236]: 
Admin UI Port [3100]: 
Telephony Port [8081]: 

Database Name [rxone_db]: 
Database User [voiceagent_user]: 
Auto-generate secure database password? [Y/n]: 

GCP Project ID []: voiceagentprojects
Gemini Model [gemini-live-2.5-flash-native-audio]: 
Gemini Voice [ANANYA]: 
Data Directory [/data]: 

Select deployment customization level:
  1) Configuration Only
  2) Domain Model Rename
  3) Custom Schema
Enter choice [1-3]: 1

[... deployment proceeds ...]

========================================
Deployment Complete: RxOne Healthcare
========================================

Admin UI: http://34.93.20.236:3100
Default User: admin
Default Password: OneView01!
```

## Utility Scripts

### Schema Renamer

Automates domain model renames across the entire codebase.

#### Usage

```bash
bash deploy/utils/schema_renamer.sh <mapping_file.json>
```

#### Mapping File Format

```json
{
  "tables": {
    "OldTableName": "NewTableName"
  },
  "columns": {
    "TableName.oldColumn": "TableName.newColumn"
  },
  "relations": {
    "ModelName.oldRelation": "ModelName.newRelation"
  },
  "terminology": {
    "old term": "new term",
    "Old Term": "New Term"
  }
}
```

#### Example: Healthcare Rename

```json
{
  "tables": {
    "CarModel": "DoctorProfile"
  },
  "columns": {
    "CarModel.modelName": "DoctorProfile.doctorName",
    "CarModel.vehicleType": "DoctorProfile.specialization",
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
```

#### What It Updates

- ✅ Prisma schema (model names, columns, relations)
- ✅ Seed data (variable names, data references)
- ✅ API routes (Prisma calls, field names)
- ✅ Validation schemas (Zod schemas, field names)
- ✅ Directory names (kebab-case conversions)
- ✅ Creates migration file
- ✅ Validates TypeScript compilation

### Agent Creator

Creates voice agents using three different methods.

#### Usage

```bash
# Method 1: Generate SQL file
bash deploy/utils/agent_creator.sh sql

# Method 2: Create via API (requires running Admin UI)
bash deploy/utils/agent_creator.sh api

# Method 3: Append to seed file
bash deploy/utils/agent_creator.sh seed
```

#### Interactive Prompts

For each agent, you'll be asked:

- **Name**: Display name (e.g., "Artemis Hospital")
- **Slug**: URL-friendly identifier (e.g., "artemis")
- **Phone Number**: Optional phone number
- **Engine**: PRIMARY or SECONDARY
- **Greeting**: Initial message to caller
- **Accent**: INDIAN, AMERICAN, BRITISH, AUSTRALIAN
- **Language**: ENGLISH, HINDI, GUJARATI, etc.
- **Voice**: ANANYA, SHIMMER, AOEDE, etc.
- **System Instructions**: 
  - Type inline (multiline)
  - Load from file
  - Use default template

#### Example: Creating Healthcare Agents

```bash
$ bash deploy/utils/agent_creator.sh sql

How many agents to create? 2

========================================
Agent #1 Details
========================================
Agent Name []: Artemis Hospital
Agent Slug [artemis-hospital]: artemis
Phone Number (optional) []: 
Engine
  1) PRIMARY
  2) SECONDARY
Enter choice [1-2]: 1
Greeting [Namaskar, welcome to Artemis Hospital. How may I help you today?]: 
Accent
  1) INDIAN
  2) AMERICAN
  3) BRITISH
  4) AUSTRALIAN
Enter choice [1-4]: 1
Language
  1) ENGLISH
  2) HINDI
[...]
Enter choice [1-8]: 1
Voice
  1) ANANYA
[...]
Enter choice [1-7]: 1

System Instructions (choose input method):
  1) Type inline (multiline)
  2) Load from file
  3) Use default template
Choice [1-3]: 2
File path: /tmp/artemis_instructions.txt

[... Agent #2 prompts ...]

========================================
Creating Agents
========================================
✓ SQL file generated: /tmp/create_agents_20260211_143022.sql

To apply:
  psql -h 127.0.0.1 -U voiceagent_user -d rxone_db -f /tmp/create_agents_20260211_143022.sql
```

## Templates

### Schema Template

Base Prisma schema with:
- Required authentication models
- Core VoiceAgent model
- Example domain models with comments
- Placeholder sections for custom entities

**Location**: `templates/schema_template.prisma`

**Usage**: Copied automatically when selecting "Custom Schema" level

### Seed Template

Base seed file with:
- User account creation
- Voice agent creation
- Placeholder sections for custom data
- Helper constants for configuration

**Location**: `templates/seed_template.ts`

**Usage**: Copied automatically when selecting "Custom Schema" level

### Environment Templates

Pre-configured environment variable templates:

- **Admin UI** (`env_admin_ui.template`):
  - Database URLs
  - NextAuth configuration
  - Customer branding

- **Telephony** (`env_telephony.template`):
  - Server configuration
  - GCP/Gemini settings
  - Audio configuration
  - Data storage paths

### Systemd Service Templates

Parameterized service files:

- **Admin UI** (`systemd_admin_ui.service.template`):
  - Next.js service configuration
  - Restart policies
  - Logging setup

- **Telephony** (`systemd_telephony.service.template`):
  - Python service configuration
  - Virtual environment setup
  - Google credentials path

## Best Practices

### 1. Always Test on Staging First

```bash
# Use TEST environment for initial deployment
# Set isLive: false for all agents initially
# Test thoroughly before switching to LIVE
```

### 2. Backup Before Major Changes

```bash
# Backup database
pg_dump -h 127.0.0.1 -U voiceagent_user rxone_db > backup_$(date +%Y%m%d).sql

# Backup deployment directory
tar -czf rxone_backup_$(date +%Y%m%d).tar.gz /opt/rxone
```

### 3. Version Control Your Customizations

```bash
# Commit schema changes
git add admin-ui/prisma/schema.prisma
git commit -m "feat: Healthcare domain model"

# Tag deployment versions
git tag -a v1.0.0-rxone -m "RxOne Healthcare v1.0.0"
```

### 4. Document Custom Configurations

```bash
# Save deployment summary
cp /opt/rxone/deployment_summary.txt ~/rxone_deployment_$(date +%Y%m%d).txt

# Save mapping configurations
cp /tmp/schema_mapping.json /opt/rxone/docs/schema_mapping.json
```

### 5. Monitor Services After Deployment

```bash
# Check service status
sudo systemctl status rxone-admin-ui
sudo systemctl status rxone-telephony

# Monitor logs in real-time
sudo journalctl -u rxone-admin-ui -f
sudo journalctl -u rxone-telephony -f

# Check for errors
sudo journalctl --since "10 minutes ago" | grep -i error
```

## Troubleshooting

### Script Fails During Prerequisites

```bash
# Install missing dependencies
sudo apt update
sudo apt install -y postgresql postgresql-contrib nodejs npm python3 python3-pip git jq

# Verify installations
node --version
npm --version
python3 --version
psql --version
```

### Database Connection Issues

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -h 127.0.0.1 -U voiceagent_user -d rxone_db -c "SELECT 1;"

# Check password in environment files
cat admin-ui/.env | grep DATABASE_URL
```

### Service Won't Start

```bash
# Check service logs
sudo journalctl -u rxone-admin-ui -n 50

# Verify working directory
ls -la /opt/rxone/admin-ui

# Check permissions
ls -ld /opt/rxone

# Try manual start
cd /opt/rxone/admin-ui
npm start -- -p 3100
```

### Schema Renamer Issues

```bash
# Restore from backup
cp admin-ui/prisma/schema.prisma.backup admin-ui/prisma/schema.prisma

# Check JSON syntax
jq . /tmp/schema_mapping.json

# Run with verbose output
bash -x deploy/utils/schema_renamer.sh /tmp/schema_mapping.json
```

## Support

- **Documentation**: See `docs/` directory for comprehensive guides
- **Troubleshooting**: See `docs/TROUBLESHOOTING.md` for common issues
- **Customization**: See `docs/CUSTOMIZATION_LEVELS.md` for guidance

## Contributing

When improving deployment scripts:

1. Test on fresh VM
2. Document new features
3. Update this README
4. Add error handling
5. Include validation checks
