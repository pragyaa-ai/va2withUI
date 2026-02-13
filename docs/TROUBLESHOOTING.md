# VA2withUI Troubleshooting Guide

This guide documents common issues encountered during deployment and their solutions, based on real-world experience.

## Table of Contents

1. [Repository & Permissions](#repository--permissions)
2. [Database Issues](#database-issues)
3. [Prisma & Migrations](#prisma--migrations)
4. [TypeScript & Build Errors](#typescript--build-errors)
5. [Service & Network Issues](#service--network-issues)
6. [Environment & Configuration](#environment--configuration)
7. [GCP Specific Issues](#gcp-specific-issues)

---

## Repository & Permissions

### Issue: Permission Denied (git clone)

**Error**:
```
fatal: could not create work tree dir 'RxOneAdminUI': Permission denied
```

**Root Cause**: Trying to clone into a directory owned by root or another user.

**Solution**:
```bash
# Change directory ownership to current user
sudo chown -R $USER:$USER /opt/rxoneadminui

# Or clone into a user-owned directory first
cd ~
git clone https://github.com/pragyaa-ai/va2withUI.git
sudo mv va2withUI /opt/rxoneadminui
sudo chown -R $USER:$USER /opt/rxoneadminui
```

**Prevention**:
Always create and set permissions on deployment directory before cloning:
```bash
sudo mkdir -p /opt/rxoneadminui
sudo chown -R $USER:$USER /opt/rxoneadminui
git clone <repo> /opt/rxoneadminui
```

---

### Issue: File Upload Goes to Wrong Directory (GCP SSH)

**Problem**: Uploaded file via GCP SSH-in-browser interface, but can't find it in `/tmp`.

**Root Cause**: GCP SSH-in-browser uploads files to `$HOME` directory, not `/tmp`.

**Solution**:
```bash
# Files are in your home directory
ls -la ~/

# Move to desired location if needed
mv ~/uploaded_file.sql /tmp/
```

**Prevention**:
When using GCP SSH-in-browser "UPLOAD FILE" button, remember files go to:
- `/home/username/` (for your user)
- NOT `/tmp/`

---

## Database Issues

### Issue: Password Authentication Failed

**Error**:
```
psql: error: connection to server at "127.0.0.1", port 5432 failed:
FATAL: password authentication failed for user "voiceagent_user"
```

**Root Cause**: Password mismatch between environment files and PostgreSQL user.

**Solution**:
```bash
# Check password in environment file
cat admin-ui/.env.local | grep DATABASE_URL

# Reset PostgreSQL user password to match
sudo -u postgres psql << EOF
ALTER USER voiceagent_user WITH PASSWORD 'YourPasswordHere';
EOF

# Or update environment files to match PostgreSQL password
```

**Prevention**:
- Use a consistent password across all config files
- Store password securely (e.g., `~/db_credentials.txt`)
- Use environment variable substitution in configs

---

### Issue: Database Already Exists

**Error**:
```
ERROR: database "voiceagent_db" already exists
ERROR: role "voiceagent_user" already exists
```

**Root Cause**: Database or user from previous installation attempt.

**Solution**:
```bash
# Drop existing database and user
sudo -u postgres psql << EOF
DROP DATABASE IF EXISTS voiceagent_db;
DROP DATABASE IF EXISTS voiceagent_shadow;
DROP ROLE IF EXISTS voiceagent_user;
EOF

# Then recreate with correct names
sudo -u postgres psql << EOF
CREATE DATABASE rxoneoneva_db;
CREATE USER voiceagent_user WITH PASSWORD 'YourPassword';
GRANT ALL PRIVILEGES ON DATABASE rxoneoneva_db TO voiceagent_user;
EOF
```

---

## Prisma & Migrations

### Issue: Environment Variable Not Found

**Error**:
```
Error: Environment variable not found: DATABASE_URL.
  --> prisma/schema.prisma:7
```

**Root Cause**: Prisma CLI looks for `.env` file, but only `.env.local` exists.

**Solution**:
Create separate `.env` file for Prisma CLI:

```bash
# Create admin-ui/.env (for Prisma CLI)
cat > admin-ui/.env << EOF
DATABASE_URL="postgresql://voiceagent_user:password@127.0.0.1:5432/rxoneoneva_db"
SHADOW_DATABASE_URL="postgresql://voiceagent_user:password@127.0.0.1:5432/rxoneoneva_shadow"
EOF

# Keep admin-ui/.env.local (for Next.js runtime)
# Both files are needed!
```

**Why This Happens**:
- **Prisma CLI** (generate, migrate, db push) reads `.env`
- **Next.js runtime** reads `.env.local`
- They need separate files

---

### Issue: Migration Failed - Relation Does Not Exist

**Error**:
```
Error: P3018
A migration failed to apply. New migrations cannot be applied before the error is recovered from.

Migration name: 20260208_add_sample_payloads
Database error: ERROR: relation "VoiceAgent" does not exist
```

**Root Cause**: Trying to run migrations on a blank database without base schema.

**Solution** (Recommended - Blank DB Approach):
```bash
# Skip migrations entirely, use db push instead
npx prisma db push

# This creates all tables from schema.prisma directly
# No migration files needed for initial setup

# If you want to track this as a migration later:
npx prisma migrate resolve --applied 20260208_add_sample_payloads
```

**Alternative** (Traditional Migration Approach):
```bash
# Create initial migration
npx prisma migrate dev --name init

# This creates migration AND applies it
```

**Prevention**:
For new deployments with customized schema, use **blank database + db push** approach:
1. Customize schema first
2. Run `npx prisma db push`
3. Avoid migration conflicts

---

### Issue: Shadow Database Does Not Exist

**Error**:
```
Error: P1003
Database `rxoneoneva_shadow` does not exist on the database server at `127.0.0.1:5432`.
```

**Root Cause**: Prisma needs a shadow database for migration diffing, but it wasn't created.

**Solution**:
```bash
# Create shadow database
sudo -u postgres psql << EOF
CREATE DATABASE rxoneoneva_shadow;
GRANT ALL PRIVILEGES ON DATABASE rxoneoneva_shadow TO voiceagent_user;
ALTER DATABASE rxoneoneva_shadow OWNER TO voiceagent_user;
EOF

# Add to environment files
echo 'SHADOW_DATABASE_URL="postgresql://voiceagent_user:password@127.0.0.1:5432/rxoneoneva_shadow"' >> admin-ui/.env
echo 'SHADOW_DATABASE_URL="postgresql://voiceagent_user:password@127.0.0.1:5432/rxoneoneva_shadow"' >> admin-ui/.env.local
```

---

### Issue: Prisma Client Out of Sync

**Error**:
```
PrismaClientValidationError: Unknown argument `storeCode`. Available options are marked with ?.
```

**Root Cause**: Prisma Client was generated before schema changes (e.g., renaming `storeCode` to `hospitalCode`).

**Solution**:
```bash
# Regenerate Prisma Client after ANY schema change
cd admin-ui
npx prisma generate

# If using TypeScript, also check for errors
npx tsc --noEmit
```

**Prevention**:
Always regenerate Prisma Client after:
- Schema changes
- Model renames
- Field renames
- Relationship changes

---

### Issue: Seed Data References Old Field Names

**Error**:
```
PrismaClientValidationError: Invalid `prisma.vmnMapping.upsert()` invocation
Argument `storeCode` is missing.
```

**Root Cause**: Seed file uses old field names after schema was updated.

**Solution**:
```bash
# Update seed.ts to match new schema
# Example: Change storeCode to hospitalCode
sed -i 's/storeCode/hospitalCode/g' admin-ui/prisma/seed.ts

# Regenerate and re-seed
npx prisma generate
npx prisma db seed
```

**Prevention**:
When renaming schema fields, update seed.ts in the same commit.

---

## TypeScript & Build Errors

### Issue: Property Does Not Exist on Type

**Error**:
```
Type error: Object literal may only specify known properties,
and 'storeCode' does not exist in type 'VmnMappingSelect<DefaultArgs>'.
```

**Root Cause**: API code references old field names after schema was renamed.

**Solution**:
```bash
# Search entire API directory for old terminology
grep -r "storeCode" admin-ui/app/api/ --include="*.ts"

# Replace all occurrences
find admin-ui/app/api/ -name "*.ts" -type f -exec sed -i 's/storeCode/hospitalCode/g' {} \;

# Also update validation schemas
sed -i 's/storeCode/hospitalCode/g' admin-ui/src/lib/validation.ts

# Verify TypeScript compilation
cd admin-ui
npx tsc --noEmit
```

**Prevention**:
When doing domain model renames, update in this order:
1. Schema (prisma/schema.prisma)
2. Seed data (prisma/seed.ts)
3. Validation schemas (src/lib/validation.ts)
4. API routes (app/api/**/*.ts)
5. Frontend forms (app/(app)/**/page.tsx)

---

### Issue: Build Fails After Schema Changes

**Error**:
```
Failed to compile.
./app/api/voiceagents/[id]/car-models/route.ts:24:32
Type error: Property 'carModel' does not exist on type...
```

**Root Cause**: Directory/file names don't match renamed entities.

**Solution**:
```bash
# Rename directories to match new terminology
mv admin-ui/app/api/voiceagents/[id]/car-models admin-ui/app/api/voiceagents/[id]/doctor-profiles

# Update all references in the renamed files
find admin-ui/app/api/voiceagents/[id]/doctor-profiles -name "*.ts" -type f -exec sed -i 's/carModel/doctorProfile/g' {} \;
find admin-ui/app/api/voiceagents/[id]/doctor-profiles -name "*.ts" -type f -exec sed -i 's/CarModel/DoctorProfile/g' {} \;

# Clear Next.js cache and rebuild
rm -rf admin-ui/.next
cd admin-ui
npm run build
```

**Prevention**:
Use schema_renamer utility to handle all renames atomically.

---

### Issue: Unique Constraint Failed on Email

**Error**:
```
PrismaClientKnownRequestError:
Unique constraint failed on the fields: (`email`)
```

**Root Cause**: Seed file tries to create user with email that already exists.

**Solution**:
```bash
# Delete old users
psql -h 127.0.0.1 -U voiceagent_user -d rxoneoneva_db << EOF
DELETE FROM "User" WHERE username IN ('SIAdmin', 'SingleInterface');
EOF

# Or update seed file to use unique emails
# Change: admin@singleinterface.com → admin@rxone.healthcare
```

**Prevention**:
When customizing seed data, ensure all unique fields (email, username, slug) are truly unique.

---

## Service & Network Issues

### Issue: Admin UI Not Accessible from External IP

**Problem**: Service runs on localhost but not accessible via external IP.

**Root Cause**: Service binds to 127.0.0.1 instead of 0.0.0.0, or firewall blocks port.

**Solution**:
```bash
# Check what address service binds to
ss -tlnp | grep 3100

# If it shows 127.0.0.1:3100, service is localhost-only
# Next.js binds to 0.0.0.0 by default, but verify with:
netstat -tlnp | grep 3100

# Check firewall (GCP)
gcloud compute firewall-rules list | grep 3100

# Create firewall rule if missing
gcloud compute firewall-rules create allow-admin-ui \
  --allow=tcp:3100 \
  --source-ranges=0.0.0.0/0
```

**For systemd service**, ensure correct start command:
```ini
# Use port binding explicitly
ExecStart=/usr/bin/npm start -- -p 3100

# NOT just: ExecStart=/usr/bin/npm start
```

---

### Issue: Service Fails to Start After Reboot

**Error**:
```
systemctl status rxone-admin-ui
● rxone-admin-ui.service - RxOne Admin UI
   Loaded: loaded
   Active: failed (Result: exit-code)
```

**Root Cause**: Incorrect `WorkingDirectory`, `User`, or `Environment` in service file.

**Solution**:
```bash
# Check service file
cat /etc/systemd/system/rxone-admin-ui.service

# Verify WorkingDirectory exists and is accessible
ls -la /opt/rxoneadminui/admin-ui

# Verify User has permissions
sudo -u info ls /opt/rxoneadminui/admin-ui

# Check service logs
sudo journalctl -u rxone-admin-ui -n 50
```

**Common Issues in Service Files**:

```ini
# WRONG: User doesn't exist or doesn't have permissions
User=root

# RIGHT: Use actual deployment user
User=info

# WRONG: Relative path
WorkingDirectory=admin-ui

# RIGHT: Absolute path
WorkingDirectory=/opt/rxoneadminui/admin-ui

# WRONG: Missing environment
ExecStart=/usr/bin/npm start

# RIGHT: With environment and port
Environment="NODE_ENV=production"
ExecStart=/usr/bin/npm start -- -p 3100
```

---

### Issue: Telephony Service Python Module Not Found

**Error**:
```
ModuleNotFoundError: No module named 'aiohttp'
```

**Root Cause**: Virtual environment not activated or dependencies not installed.

**Solution**:
```bash
# Recreate virtual environment
cd /opt/rxoneadminui/telephony
rm -rf venv
python3 -m venv venv

# Activate and install dependencies
source venv/bin/activate
pip install -r requirements.txt
deactivate

# Update systemd service to use venv Python
sudo tee /etc/systemd/system/rxone-telephony.service > /dev/null << EOF
[Service]
Environment="PATH=/opt/rxoneadminui/telephony/venv/bin"
ExecStart=/opt/rxoneadminui/telephony/venv/bin/python main.py
EOF

# Restart service
sudo systemctl daemon-reload
sudo systemctl restart rxone-telephony
```

---

### Issue: Port Already in Use

**Error**:
```
Error: listen EADDRINUSE: address already in use :::3100
```

**Root Cause**: Another process is using the port.

**Solution**:
```bash
# Find process using port
sudo lsof -i :3100

# Kill process if needed
sudo kill -9 <PID>

# Or change port in service file and restart
```

---

## Environment & Configuration

### Issue: NextAuth URL Mismatch

**Problem**: Login redirects fail or show CORS errors.

**Root Cause**: `NEXTAUTH_URL` doesn't match actual access URL.

**Solution**:
```bash
# Get actual external IP
EXTERNAL_IP=$(curl -s ifconfig.me)

# Update .env.local
sed -i "s|NEXTAUTH_URL=.*|NEXTAUTH_URL=\"http://${EXTERNAL_IP}:3100\"|" admin-ui/.env.local

# Restart service
sudo systemctl restart rxone-admin-ui
```

---

### Issue: Missing Slug Field in VoiceAgent Creation

**Error** (Browser console):
```
400 Bad Request: slug is required
```

**Root Cause**: Frontend form doesn't include slug field, but API requires it.

**Solution**:
Update `admin-ui/app/(app)/voiceagents/new/page.tsx`:

```typescript
const [form, setForm] = useState({
  name: "",
  slug: "",  // Add this
  phoneNumber: "",
  // ... other fields
});

// Add slug input field
<Input
  label="Slug"
  value={form.slug}
  onChange={(e) => setForm({ ...form, slug: e.target.value })}
  required
/>
```

After updating form:
```bash
# Clear Next.js cache
rm -rf admin-ui/.next

# Rebuild
cd admin-ui
npm run build

# Restart service
sudo systemctl restart rxone-admin-ui
```

---

## GCP Specific Issues

### Issue: Cannot List Firewall Rules

**Error**:
```
ERROR: (gcloud.compute.firewall-rules.list) Some requests did not succeed:
- Request had insufficient authentication scopes.
```

**Root Cause**: Not authenticated with correct scopes.

**Solution**:
```bash
# Authenticate with application default credentials
gcloud auth application-default login

# Set project
gcloud config set project voiceagentprojects

# Now try listing firewall rules
gcloud compute firewall-rules list
```

---

### Issue: VM Cannot Access Google APIs

**Problem**: Telephony service can't connect to Gemini API.

**Root Cause**: Missing Google Cloud credentials or IAM permissions.

**Solution**:
```bash
# Set up application default credentials
gcloud auth application-default login

# Verify credentials file exists
ls -la ~/.config/gcloud/application_default_credentials.json

# Update service file to use credentials
sudo sed -i '/\[Service\]/a Environment="GOOGLE_APPLICATION_CREDENTIALS=/home/info/.config/gcloud/application_default_credentials.json"' \
  /etc/systemd/system/rxone-telephony.service

# Restart service
sudo systemctl daemon-reload
sudo systemctl restart rxone-telephony
```

---

## Quick Diagnostic Commands

### Check All Critical Services

```bash
#!/bin/bash
echo "=== System Status ==="

echo -n "PostgreSQL: "
systemctl is-active postgresql

echo -n "Admin UI: "
systemctl is-active rxone-admin-ui

echo -n "Telephony: "
systemctl is-active rxone-telephony

echo ""
echo "=== Port Status ==="
ss -tlnp | grep -E "(3100|8081|5432)"

echo ""
echo "=== Database Connectivity ==="
psql -h 127.0.0.1 -U voiceagent_user -d rxoneoneva_db -c "SELECT COUNT(*) FROM \"User\";" 2>&1

echo ""
echo "=== Recent Service Errors ==="
sudo journalctl -u rxone-admin-ui --since "10 min ago" | grep -i error | tail -5
sudo journalctl -u rxone-telephony --since "10 min ago" | grep -i error | tail -5
```

---

## Getting More Help

### Useful Log Commands

```bash
# Admin UI logs (last 50 lines)
sudo journalctl -u rxone-admin-ui -n 50

# Telephony logs (follow live)
sudo journalctl -u rxone-telephony -f

# PostgreSQL logs
sudo journalctl -u postgresql -n 50

# All errors in last hour
sudo journalctl --since "1 hour ago" | grep -i error
```

### Before Reporting an Issue

Collect this information:
1. Error message (exact text)
2. Command that caused the error
3. Relevant logs (from journalctl)
4. Database connectivity test result
5. Service status output
6. Which customization level you're using

### Contact

- Documentation: See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- Support: support@pragyaa.ai
