# VA2withUI Custom Deployment System

A comprehensive deployment automation system for deploying va2withUI with customer-specific customizations.

## Overview

This system enables rapid deployment of va2withUI voice agent platform for new customers with three levels of customization:

1. **Configuration Only** - Use base schema, customize branding and settings (fastest)
2. **Domain Model Rename** - Rename entities to match customer domain (moderate complexity)
3. **Custom Schema** - Design completely new data model (most flexible)

## Key Features

- ✅ **Automated Deployment**: Single script deploys complete system
- ✅ **Interactive Prompts**: Guided configuration with sensible defaults
- ✅ **Pre-flight Checks**: Validates all prerequisites before starting
- ✅ **Three Customization Levels**: From simple to complex
- ✅ **Schema Automation**: Automated domain model renaming utility
- ✅ **Agent Creation**: Multiple methods to create voice agents
- ✅ **Environment Templates**: Pre-configured for common scenarios
- ✅ **Service Management**: Systemd services with auto-restart
- ✅ **Post-Deployment Verification**: Automated health checks
- ✅ **Comprehensive Documentation**: Step-by-step guides with examples

## Quick Start

### 1. Prerequisites

Ensure your system has:
- Ubuntu 22.04 LTS or later
- PostgreSQL 14+
- Node.js 18+
- Python 3.10+
- Git

### 2. Deploy

```bash
# Clone the repository
git clone https://github.com/pragyaa-ai/va2withUI.git
cd va2withUI

# Run deployment script
bash deploy/setup_customer.sh
```

### 3. Follow Prompts

The script will guide you through:
- Customer information (name, slug, domain)
- Database configuration (auto-generates secure passwords)
- GCP/Telephony settings
- Customization level selection
- Complete deployment with verification

### 4. Access

After deployment completes:
- **Admin UI**: `http://YOUR_IP:3100`
- **Default User**: `admin` / `OneView01!`
- **Telephony**: Port `8081`

## Architecture

### Decision: Blank Database Approach

Based on RxOne deployment experience, we recommend **starting with blank database and customizing schema BEFORE first migration** rather than base-then-migrate approach.

**Benefits**:
- ✅ Cleaner: No migration conflicts
- ✅ Safer: Avoid complex rename migrations
- ✅ Faster: Single schema push vs multiple migrations
- ✅ Testable: Easy to iterate on schema design

### Deployment Flow

```
Start
  ↓
Pre-flight Checks
  ↓
Gather Customer Info
  ↓
Clone Repository
  ↓
Select Customization Level
  ├─→ Config Only → Configure Environment
  ├─→ Domain Rename → Customize Schema & Routes
  └─→ Custom Schema → Design Schema
  ↓
Setup Database
  ↓
Generate Environment Files
  ↓
Install Dependencies
  ↓
Prisma Generate & DB Push
  ↓
Seed Database
  ↓
Build Application
  ↓
Setup Systemd Services
  ↓
Configure Firewall
  ↓
Verify Deployment
  ↓
Generate Summary
  ↓
Complete
```

## Directory Structure

```
.
├── docs/                               # Comprehensive documentation
│   ├── DEPLOYMENT_GUIDE.md             # Step-by-step deployment guide
│   ├── CUSTOMIZATION_LEVELS.md         # Choosing right customization level
│   └── TROUBLESHOOTING.md              # Common issues and solutions
│
├── deploy/                             # Deployment automation
│   ├── README.md                       # Deployment tools documentation
│   ├── setup_customer.sh               # Main deployment script ⭐
│   │
│   ├── templates/                      # Configuration templates
│   │   ├── schema_template.prisma      # Prisma schema template
│   │   ├── seed_template.ts            # Seed data template
│   │   ├── env_admin_ui.template       # Admin UI environment
│   │   ├── env_telephony.template      # Telephony environment
│   │   ├── systemd_admin_ui.service.template
│   │   └── systemd_telephony.service.template
│   │
│   ├── utils/                          # Utility scripts
│   │   ├── schema_renamer.sh           # Automate domain renames ⭐
│   │   └── agent_creator.sh            # Create voice agents ⭐
│   │
│   └── config/                         # Customer configurations
│
├── admin-ui/                           # Next.js Admin UI
│   ├── prisma/                         # Database schema & migrations
│   ├── app/                            # Application pages & API routes
│   └── src/                            # Shared utilities
│
└── telephony/                          # Python telephony service
    ├── main.py                         # WebSocket server
    └── requirements.txt                # Python dependencies
```

## Documentation

### For Engineers Deploying

1. **[DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)** - Complete deployment instructions
   - Prerequisites
   - Quick Start (Config Only)
   - Domain Model Deployment
   - Custom Schema Deployment
   - Post-Deployment Verification
   - Rollback Procedures

2. **[CUSTOMIZATION_LEVELS.md](docs/CUSTOMIZATION_LEVELS.md)** - Choosing the right approach
   - Level 1: Configuration Only
   - Level 2: Domain Model Rename
   - Level 3: Custom Schema
   - Decision Matrix
   - Industry Examples

3. **[TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Common issues from real deployments
   - Repository & Permissions
   - Database Issues
   - Prisma & Migrations
   - TypeScript & Build Errors
   - Service & Network Issues
   - GCP Specific Issues

4. **[deploy/README.md](deploy/README.md)** - Deployment tools reference
   - Main deployment script usage
   - Schema renamer utility
   - Agent creator utility
   - Templates documentation

## Key Scripts

### Main Deployment Script

**File**: `deploy/setup_customer.sh`

**Purpose**: Automated end-to-end deployment

**Features**:
- Interactive prompts with validation
- Pre-flight prerequisite checks
- Database setup with secure password generation
- Environment file generation
- Dependency installation
- Database initialization (Prisma push & seed)
- Application build
- Systemd service creation
- Firewall configuration (GCP)
- Post-deployment verification
- Summary report generation

**Usage**:
```bash
bash deploy/setup_customer.sh
```

### Schema Renamer Utility

**File**: `deploy/utils/schema_renamer.sh`

**Purpose**: Automate domain model renames across entire codebase

**What It Updates**:
- Prisma schema (models, columns, relations)
- Seed data (variables, data references)
- API routes (all TypeScript files)
- Validation schemas (Zod schemas)
- Directory names (kebab-case)
- Creates migration file

**Usage**:
```bash
# Create mapping file
cat > /tmp/mapping.json <<EOF
{
  "tables": {"CarModel": "DoctorProfile"},
  "columns": {"CarModel.modelName": "DoctorProfile.doctorName"},
  "terminology": {"car model": "doctor"}
}
EOF

# Run renamer
bash deploy/utils/schema_renamer.sh /tmp/mapping.json
```

### Agent Creator Utility

**File**: `deploy/utils/agent_creator.sh`

**Purpose**: Create voice agents using three methods

**Methods**:
1. **SQL** - Generate SQL INSERT statements
2. **API** - Create via REST API (requires running Admin UI)
3. **Seed** - Append to Prisma seed file

**Usage**:
```bash
# Generate SQL file
bash deploy/utils/agent_creator.sh sql

# Create via API
bash deploy/utils/agent_creator.sh api

# Append to seed file
bash deploy/utils/agent_creator.sh seed
```

## Templates

### Schema Template

Pre-configured Prisma schema with:
- Required authentication models (User, Account, Session)
- Core VoiceAgent model
- Example domain models with detailed comments
- Placeholder sections for custom entities
- Best practices and guidelines

### Seed Template

Pre-configured seed file with:
- User account creation (with configurable credentials)
- Voice agent creation (with customizable prompts)
- Domain-specific data sections (commented examples)
- Helper constants for easy configuration

### Environment Templates

Ready-to-use environment configurations:
- Admin UI (.env and .env.local)
- Telephony service (.env)
- All with clear variable documentation

### Systemd Service Templates

Production-ready service files:
- Proper restart policies
- Logging configuration
- Security settings
- User/group management

## Real-World Example: RxOne Healthcare

### Problem

Deploy va2withUI for RxOne Healthcare with:
- Healthcare terminology (not automotive)
- Doctors instead of car models
- Hospital codes instead of store codes
- Multiple hospitals (Artemis, Fortis, Max, Medanta)

### Solution

Used **Level 2: Domain Model Rename**

1. Cloned base repository
2. Created mapping configuration
3. Ran schema_renamer utility
4. Updated seed data
5. Built and deployed
6. Created healthcare voice agents

### Results

- ✅ Deployment completed in 2 hours
- ✅ Clean healthcare terminology throughout
- ✅ Zero migration conflicts
- ✅ 3 voice agents created (Artemis, Giva, Rova)
- ✅ Production-ready services

### Lessons Learned

Documented in [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md):
- File upload in GCP SSH goes to $HOME, not /tmp
- Need separate .env for Prisma CLI vs Next.js runtime
- Always regenerate Prisma client after schema changes
- Clear Next.js cache after significant changes
- Use blank DB approach to avoid migration conflicts

## Support & Contribution

### Getting Help

1. Check [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for common issues
2. Review [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md) for step-by-step instructions
3. See [CUSTOMIZATION_LEVELS.md](docs/CUSTOMIZATION_LEVELS.md) for guidance

### Contributing

When improving the deployment system:

1. **Test Thoroughly**: Test on fresh VM for each customization level
2. **Document Changes**: Update relevant documentation files
3. **Error Handling**: Include validation and helpful error messages
4. **Idempotency**: Ensure scripts can be re-run safely
5. **Backup Safety**: Always create backups before destructive operations

### Best Practices

1. **Always start with blank database** for customized schemas
2. **Test on staging first** before production deployment
3. **Version control customizations** with git tags
4. **Monitor services** after deployment with journalctl
5. **Document customer-specific configurations**

## Testing Status

- ✅ Documentation: Complete and comprehensive
- ✅ Main Deployment Script: Implemented with validation
- ✅ Schema Renamer: Implemented and tested on RxOne
- ✅ Agent Creator: Implemented with 3 methods
- ✅ Templates: Created for all components
- ⏳ VM Testing: Pending (requires clean VM access)

## Future Enhancements

Potential improvements:

- [ ] Web-based deployment UI
- [ ] Docker containerization
- [ ] CI/CD integration
- [ ] Automated testing framework
- [ ] Multi-region deployment support
- [ ] Backup/restore automation
- [ ] Monitoring dashboard integration
- [ ] Schema migration rollback support

## License

[Your License Here]

## Credits

Developed based on real-world deployment experience with:
- RxOne Healthcare deployment
- va2withUI base platform
- Lessons learned from production deployments

---

**Ready to deploy?** Start with the [DEPLOYMENT_GUIDE.md](docs/DEPLOYMENT_GUIDE.md)!
