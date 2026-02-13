#!/bin/bash

# ============================================================================
# VA2withUI Customer Deployment Script
# ============================================================================
#
# This script automates the deployment of va2withUI for a new customer.
# It supports three customization levels:
#   1. Configuration Only
#   2. Domain Model Rename
#   3. Custom Schema
#
# Usage:
#   bash deploy/setup_customer.sh
#
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
    echo -e "\n${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

prompt_input() {
    local prompt="$1"
    local default="$2"
    local var_name="$3"
    
    if [ -n "$default" ]; then
        read -p "$prompt [$default]: " input
        eval "$var_name=\"${input:-$default}\""
    else
        read -p "$prompt: " input
        eval "$var_name=\"$input\""
    fi
}

prompt_password() {
    local prompt="$1"
    local var_name="$2"
    read -sp "$prompt: " input
    echo
    eval "$var_name=\"$input\""
}

prompt_confirm() {
    local prompt="$1"
    local default="$2"
    
    if [ "$default" = "y" ]; then
        read -p "$prompt [Y/n]: " response
        response=${response:-y}
    else
        read -p "$prompt [y/N]: " response
        response=${response:-n}
    fi
    
    [[ "$response" =~ ^[Yy]$ ]]
}

check_command() {
    if ! command -v "$1" &> /dev/null; then
        print_error "$1 is not installed"
        return 1
    fi
    print_success "$1 is installed"
    return 0
}

# ============================================================================
# Pre-flight Checks
# ============================================================================

preflight_checks() {
    print_header "Pre-flight Checks"
    
    local all_good=true
    
    print_info "Checking prerequisites..."
    
    check_command "git" || all_good=false
    check_command "node" || all_good=false
    check_command "npm" || all_good=false
    check_command "python3" || all_good=false
    check_command "pip3" || all_good=false
    check_command "psql" || all_good=false
    check_command "pg_config" || all_good=false
    
    if [ "$all_good" = false ]; then
        print_error "Some prerequisites are missing. Please install them first."
        print_info "See docs/DEPLOYMENT_GUIDE.md for installation instructions."
        exit 1
    fi
    
    print_success "All prerequisites met!"
}

# ============================================================================
# Gather Customer Information
# ============================================================================

gather_customer_info() {
    print_header "Customer Information"
    
    prompt_input "Customer Name (e.g., 'RxOne Healthcare')" "" CUSTOMER_NAME
    prompt_input "Customer Slug (lowercase, alphanumeric, dashes/underscores)" "" CUSTOMER_SLUG
    
    # Validate slug
    if [[ ! "$CUSTOMER_SLUG" =~ ^[a-z0-9_-]+$ ]]; then
        print_error "Invalid slug. Use only lowercase letters, numbers, dashes, and underscores."
        exit 1
    fi
    
    prompt_input "Customer Domain (e.g., 'rxone.healthcare')" "$CUSTOMER_SLUG.com" CUSTOMER_DOMAIN
    prompt_input "Deployment Path" "/opt/$CUSTOMER_SLUG" DEPLOY_PATH
    prompt_input "External IP or Domain" "$(curl -s ifconfig.me 2>/dev/null || echo 'localhost')" EXTERNAL_IP
    prompt_input "Admin UI Port" "3100" ADMIN_UI_PORT
    prompt_input "Telephony Port" "8081" TELEPHONY_PORT
    
    # Get current user
    DEPLOY_USER="${USER:-$(whoami)}"
    print_info "Deploy User: $DEPLOY_USER"
}

# ============================================================================
# Database Configuration
# ============================================================================

configure_database() {
    print_header "Database Configuration"
    
    prompt_input "Database Name" "${CUSTOMER_SLUG}_db" DB_NAME
    prompt_input "Database User" "voiceagent_user" DB_USER
    
    # Generate or prompt for password
    if prompt_confirm "Auto-generate secure database password?" "y"; then
        DB_PASSWORD=$(openssl rand -base64 24 | tr -d "=+/" | cut -c1-20)
        print_success "Generated password: $DB_PASSWORD"
    else
        prompt_password "Database Password" DB_PASSWORD
    fi
    
    SHADOW_DB_NAME="${DB_NAME}_shadow"
    print_info "Shadow Database: $SHADOW_DB_NAME"
}

# ============================================================================
# GCP / Telephony Configuration
# ============================================================================

configure_gcp() {
    print_header "GCP / Telephony Configuration"
    
    prompt_input "GCP Project ID" "" GCP_PROJECT_ID
    prompt_input "Gemini Model" "gemini-live-2.5-flash-native-audio" GEMINI_MODEL
    prompt_input "Gemini Voice" "ANANYA" GEMINI_VOICE
    prompt_input "Data Directory" "/data" DATA_DIR
    
    # Google credentials path
    GOOGLE_CREDENTIALS_PATH="/home/$DEPLOY_USER/.config/gcloud/application_default_credentials.json"
    
    if [ ! -f "$GOOGLE_CREDENTIALS_PATH" ]; then
        print_warning "Google Cloud credentials not found at: $GOOGLE_CREDENTIALS_PATH"
        print_info "You may need to run: gcloud auth application-default login"
    else
        print_success "Google Cloud credentials found"
    fi
}

# ============================================================================
# Customization Level Selection
# ============================================================================

select_customization_level() {
    print_header "Customization Level"
    
    echo "Select deployment customization level:"
    echo "  1) Configuration Only (use base schema as-is)"
    echo "  2) Domain Model Rename (rename entities to match your domain)"
    echo "  3) Custom Schema (completely new data model)"
    echo ""
    
    while true; do
        read -p "Enter choice [1-3]: " CUSTOM_LEVEL
        case $CUSTOM_LEVEL in
            1)
                print_info "Selected: Configuration Only"
                break
                ;;
            2)
                print_info "Selected: Domain Model Rename"
                break
                ;;
            3)
                print_info "Selected: Custom Schema"
                break
                ;;
            *)
                print_error "Invalid choice. Please enter 1, 2, or 3."
                ;;
        esac
    done
}

# ============================================================================
# Clone Repository
# ============================================================================

clone_repository() {
    print_header "Cloning Repository"
    
    if [ -d "$DEPLOY_PATH" ]; then
        print_warning "Directory $DEPLOY_PATH already exists"
        if prompt_confirm "Remove and re-clone?" "n"; then
            sudo rm -rf "$DEPLOY_PATH"
        else
            print_error "Deployment cancelled"
            exit 1
        fi
    fi
    
    # Create and set permissions
    sudo mkdir -p "$DEPLOY_PATH"
    sudo chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_PATH"
    
    # Clone repository
    print_info "Cloning va2withUI to $DEPLOY_PATH..."
    git clone https://github.com/pragyaa-ai/va2withUI.git "$DEPLOY_PATH"
    
    cd "$DEPLOY_PATH"
    print_success "Repository cloned successfully"
}

# ============================================================================
# Apply Customizations
# ============================================================================

apply_customizations() {
    case $CUSTOM_LEVEL in
        1)
            print_info "No schema customization needed for Configuration Only"
            ;;
        2)
            apply_domain_rename
            ;;
        3)
            apply_custom_schema
            ;;
    esac
}

apply_domain_rename() {
    print_header "Domain Model Customization"
    
    print_info "This feature requires manual configuration."
    print_info "See docs/DEPLOYMENT_GUIDE.md for Domain Model Rename instructions."
    
    if prompt_confirm "Use schema_renamer utility?" "y"; then
        print_info "You'll need to create a mapping configuration file."
        print_info "See deploy/utils/schema_renamer.sh for details."
        
        if [ -f "/tmp/schema_mapping.json" ]; then
            bash deploy/utils/schema_renamer.sh /tmp/schema_mapping.json
        else
            print_warning "No mapping file found at /tmp/schema_mapping.json"
            print_info "Skipping automated rename. You can run it manually later."
        fi
    fi
}

apply_custom_schema() {
    print_header "Custom Schema Setup"
    
    print_info "Copying schema template..."
    cp deploy/templates/schema_template.prisma admin-ui/prisma/schema.prisma
    
    print_info "Copying seed template..."
    cp deploy/templates/seed_template.ts admin-ui/prisma/seed.ts
    
    print_warning "Please edit these files to define your custom schema:"
    print_info "  - admin-ui/prisma/schema.prisma"
    print_info "  - admin-ui/prisma/seed.ts"
    
    if ! prompt_confirm "Have you customized the schema files?" "n"; then
        print_error "Please customize the schema files before continuing"
        exit 1
    fi
}

# ============================================================================
# Setup Database
# ============================================================================

setup_database() {
    print_header "Database Setup"
    
    print_info "Creating databases..."
    
    # Check if databases exist
    DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")
    
    if [ "$DB_EXISTS" = "1" ]; then
        print_warning "Database $DB_NAME already exists"
        if prompt_confirm "Drop and recreate?" "n"; then
            sudo -u postgres psql <<EOF
DROP DATABASE IF EXISTS "$DB_NAME";
DROP DATABASE IF EXISTS "$SHADOW_DB_NAME";
EOF
        else
            print_info "Using existing database"
            return
        fi
    fi
    
    # Create database and user
    sudo -u postgres psql <<EOF
-- Create databases
CREATE DATABASE "$DB_NAME";
CREATE DATABASE "$SHADOW_DB_NAME";

-- Create user if not exists
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
        CREATE USER "$DB_USER" WITH PASSWORD '$DB_PASSWORD';
    ELSE
        ALTER USER "$DB_USER" WITH PASSWORD '$DB_PASSWORD';
    END IF;
END
\$\$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE "$DB_NAME" TO "$DB_USER";
GRANT ALL PRIVILEGES ON DATABASE "$SHADOW_DB_NAME" TO "$DB_USER";

-- Set ownership
ALTER DATABASE "$DB_NAME" OWNER TO "$DB_USER";
ALTER DATABASE "$SHADOW_DB_NAME" OWNER TO "$DB_USER";

-- Grant schema privileges
\c "$DB_NAME"
GRANT ALL ON SCHEMA public TO "$DB_USER";

\c "$SHADOW_DB_NAME"
GRANT ALL ON SCHEMA public TO "$DB_USER";
EOF
    
    print_success "Databases created successfully"
    
    # Save credentials
    cat > ~/db_credentials_${CUSTOMER_SLUG}.txt <<EOF
Database Name: $DB_NAME
Database User: $DB_USER
Database Password: $DB_PASSWORD
Shadow Database: $SHADOW_DB_NAME
EOF
    
    print_info "Database credentials saved to: ~/db_credentials_${CUSTOMER_SLUG}.txt"
}

# ============================================================================
# Generate Environment Files
# ============================================================================

generate_env_files() {
    print_header "Generating Environment Files"
    
    # Generate NextAuth secret
    NEXTAUTH_SECRET=$(openssl rand -base64 32)
    
    # Admin UI .env (for Prisma CLI)
    print_info "Creating admin-ui/.env..."
    cat > admin-ui/.env <<EOF
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$DB_NAME"
SHADOW_DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$SHADOW_DB_NAME"
EOF
    
    # Admin UI .env.local (for Next.js)
    print_info "Creating admin-ui/.env.local..."
    cat > admin-ui/.env.local <<EOF
# Database
DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$DB_NAME"
SHADOW_DATABASE_URL="postgresql://$DB_USER:$DB_PASSWORD@127.0.0.1:5432/$SHADOW_DB_NAME"

# NextAuth
NEXTAUTH_URL="http://$EXTERNAL_IP:$ADMIN_UI_PORT"
NEXTAUTH_SECRET="$NEXTAUTH_SECRET"

# Customer Branding
NEXT_PUBLIC_CUSTOMER_NAME="$CUSTOMER_NAME"
EOF
    
    # Telephony .env
    print_info "Creating telephony/.env..."
    cat > telephony/.env <<EOF
# Server Configuration
HOST=0.0.0.0
PORT=$TELEPHONY_PORT
WS_PATH=/ws
EXOTEL_WS_PATH=/exotel

# Google Cloud / Gemini
GCP_PROJECT_ID=$GCP_PROJECT_ID
GEMINI_LOCATION=us-central1
GEMINI_MODEL=$GEMINI_MODEL
GEMINI_VOICE=$GEMINI_VOICE

# Audio Settings
TELEPHONY_SR=8000
GEMINI_INPUT_SR=16000
GEMINI_OUTPUT_SR=24000
AUDIO_BUFFER_MS_INPUT=100
AUDIO_BUFFER_MS_OUTPUT=100

# Data Storage
DATA_BASE_DIR=$DATA_DIR
ENABLE_DATA_STORAGE=true

# Admin UI Integration
ADMIN_API_BASE=http://127.0.0.1:$ADMIN_UI_PORT
EOF
    
    print_success "Environment files created"
}

# ============================================================================
# Install Dependencies
# ============================================================================

install_dependencies() {
    print_header "Installing Dependencies"
    
    # Admin UI
    print_info "Installing Admin UI dependencies..."
    cd admin-ui
    npm install
    cd ..
    
    # Telephony
    print_info "Installing Telephony dependencies..."
    cd telephony
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    deactivate
    cd ..
    
    print_success "Dependencies installed"
}

# ============================================================================
# Initialize Database
# ============================================================================

initialize_database() {
    print_header "Initializing Database"
    
    cd admin-ui
    
    # Generate Prisma client
    print_info "Generating Prisma client..."
    npx prisma generate
    
    # Push schema to database (blank DB approach)
    print_info "Pushing schema to database..."
    npx prisma db push --skip-generate
    
    # Seed database
    if prompt_confirm "Seed database with default data?" "y"; then
        print_info "Seeding database..."
        npx prisma db seed
    fi
    
    cd ..
    
    print_success "Database initialized"
}

# ============================================================================
# Build Application
# ============================================================================

build_application() {
    print_header "Building Application"
    
    cd admin-ui
    
    print_info "Building Next.js application..."
    npm run build
    
    cd ..
    
    print_success "Application built successfully"
}

# ============================================================================
# Setup Systemd Services
# ============================================================================

setup_systemd_services() {
    print_header "Setting up Systemd Services"
    
    # Admin UI service
    print_info "Creating Admin UI service..."
    sudo tee /etc/systemd/system/${CUSTOMER_SLUG}-admin-ui.service > /dev/null <<EOF
[Unit]
Description=${CUSTOMER_NAME} Admin UI (Next.js)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=$DEPLOY_USER
Group=$DEPLOY_USER
WorkingDirectory=$DEPLOY_PATH/admin-ui
Environment="NODE_ENV=production"
Environment="PATH=/usr/bin:/usr/local/bin"
ExecStart=/usr/bin/npm start -- -p $ADMIN_UI_PORT
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${CUSTOMER_SLUG}-admin-ui
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
    
    # Telephony service
    print_info "Creating Telephony service..."
    sudo tee /etc/systemd/system/${CUSTOMER_SLUG}-telephony.service > /dev/null <<EOF
[Unit]
Description=${CUSTOMER_NAME} Telephony Service (Python)
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=$DEPLOY_USER
Group=$DEPLOY_USER
WorkingDirectory=$DEPLOY_PATH/telephony
Environment="PATH=$DEPLOY_PATH/telephony/venv/bin:/usr/bin"
Environment="PYTHONUNBUFFERED=1"
Environment="GOOGLE_APPLICATION_CREDENTIALS=$GOOGLE_CREDENTIALS_PATH"
ExecStart=$DEPLOY_PATH/telephony/venv/bin/python main.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${CUSTOMER_SLUG}-telephony
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
    
    # Reload systemd
    sudo systemctl daemon-reload
    
    # Enable services
    sudo systemctl enable ${CUSTOMER_SLUG}-admin-ui
    sudo systemctl enable ${CUSTOMER_SLUG}-telephony
    
    # Start services
    print_info "Starting services..."
    sudo systemctl start ${CUSTOMER_SLUG}-admin-ui
    sudo systemctl start ${CUSTOMER_SLUG}-telephony
    
    # Wait a moment for services to start
    sleep 3
    
    # Check status
    if systemctl is-active --quiet ${CUSTOMER_SLUG}-admin-ui; then
        print_success "Admin UI service is running"
    else
        print_error "Admin UI service failed to start"
        sudo journalctl -u ${CUSTOMER_SLUG}-admin-ui -n 20
    fi
    
    if systemctl is-active --quiet ${CUSTOMER_SLUG}-telephony; then
        print_success "Telephony service is running"
    else
        print_error "Telephony service failed to start"
        sudo journalctl -u ${CUSTOMER_SLUG}-telephony -n 20
    fi
}

# ============================================================================
# Configure Firewall (GCP)
# ============================================================================

configure_firewall() {
    print_header "Firewall Configuration"
    
    if ! command -v gcloud &> /dev/null; then
        print_warning "gcloud CLI not found. Skipping firewall configuration."
        print_info "You'll need to manually configure firewall rules for ports $ADMIN_UI_PORT and $TELEPHONY_PORT"
        return
    fi
    
    if prompt_confirm "Configure GCP firewall rules?" "y"; then
        print_info "Creating firewall rule for Admin UI..."
        gcloud compute firewall-rules create allow-${CUSTOMER_SLUG}-admin-ui \
            --allow=tcp:$ADMIN_UI_PORT \
            --source-ranges=0.0.0.0/0 \
            --description="Allow ${CUSTOMER_NAME} Admin UI access" \
            2>/dev/null || print_warning "Firewall rule may already exist"
        
        print_info "Creating firewall rule for Telephony..."
        gcloud compute firewall-rules create allow-${CUSTOMER_SLUG}-telephony \
            --allow=tcp:$TELEPHONY_PORT \
            --source-ranges=0.0.0.0/0 \
            --description="Allow ${CUSTOMER_NAME} Telephony access" \
            2>/dev/null || print_warning "Firewall rule may already exist"
        
        print_success "Firewall rules configured"
    fi
}

# ============================================================================
# Post-Deployment Verification
# ============================================================================

verify_deployment() {
    print_header "Post-Deployment Verification"
    
    # Database connectivity
    print_info "Checking database connectivity..."
    if psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -c "SELECT COUNT(*) FROM \"User\";" > /dev/null 2>&1; then
        print_success "Database is accessible"
    else
        print_error "Database connection failed"
    fi
    
    # Admin UI port
    print_info "Checking Admin UI port..."
    if ss -tlnp 2>/dev/null | grep -q ":$ADMIN_UI_PORT"; then
        print_success "Admin UI is listening on port $ADMIN_UI_PORT"
    else
        print_error "Admin UI is not listening on port $ADMIN_UI_PORT"
    fi
    
    # Telephony port
    print_info "Checking Telephony port..."
    if ss -tlnp 2>/dev/null | grep -q ":$TELEPHONY_PORT"; then
        print_success "Telephony is listening on port $TELEPHONY_PORT"
    else
        print_error "Telephony is not listening on port $TELEPHONY_PORT"
    fi
    
    # HTTP response
    print_info "Checking Admin UI HTTP response..."
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:$ADMIN_UI_PORT 2>/dev/null || echo "000")
    if [[ "$HTTP_CODE" =~ ^(200|307)$ ]]; then
        print_success "Admin UI is responding (HTTP $HTTP_CODE)"
    else
        print_error "Admin UI is not responding correctly (HTTP $HTTP_CODE)"
    fi
}

# ============================================================================
# Generate Deployment Summary
# ============================================================================

generate_summary() {
    print_header "Deployment Summary"
    
    cat <<EOF

========================================
Deployment Complete: ${CUSTOMER_NAME}
========================================

Database:
  Name: ${DB_NAME}
  User: ${DB_USER}
  Credentials: ~/db_credentials_${CUSTOMER_SLUG}.txt

Admin UI:
  URL: http://${EXTERNAL_IP}:${ADMIN_UI_PORT}
  Default User: admin
  Default Password: OneView01!

Telephony:
  Port: ${TELEPHONY_PORT}
  Model: ${GEMINI_MODEL}
  Voice: ${GEMINI_VOICE}

Services:
  Admin UI: sudo systemctl status ${CUSTOMER_SLUG}-admin-ui
  Telephony: sudo systemctl status ${CUSTOMER_SLUG}-telephony

Logs:
  Admin UI: sudo journalctl -u ${CUSTOMER_SLUG}-admin-ui -f
  Telephony: sudo journalctl -u ${CUSTOMER_SLUG}-telephony -f

Next Steps:
  1. Login to Admin UI: http://${EXTERNAL_IP}:${ADMIN_UI_PORT}
  2. Change default passwords
  3. Create voice agents via UI or script
  4. Update voice agent system instructions
  5. Test telephony integration

Documentation:
  Deployment Guide: docs/DEPLOYMENT_GUIDE.md
  Troubleshooting: docs/TROUBLESHOOTING.md
  Customization: docs/CUSTOMIZATION_LEVELS.md

========================================

EOF
    
    # Save summary
    cat > ${DEPLOY_PATH}/deployment_summary.txt <<EOF
Deployment Summary: ${CUSTOMER_NAME}
Date: $(date)

Database: ${DB_NAME}
User: ${DB_USER}
Admin UI: http://${EXTERNAL_IP}:${ADMIN_UI_PORT}
Telephony Port: ${TELEPHONY_PORT}

Services:
  - ${CUSTOMER_SLUG}-admin-ui
  - ${CUSTOMER_SLUG}-telephony
EOF
    
    print_success "Deployment summary saved to: ${DEPLOY_PATH}/deployment_summary.txt"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    print_header "VA2withUI Customer Deployment"
    
    echo "This script will guide you through deploying va2withUI for a new customer."
    echo ""
    
    if ! prompt_confirm "Continue with deployment?" "y"; then
        print_info "Deployment cancelled"
        exit 0
    fi
    
    # Execute deployment steps
    preflight_checks
    gather_customer_info
    configure_database
    configure_gcp
    select_customization_level
    clone_repository
    apply_customizations
    setup_database
    generate_env_files
    install_dependencies
    initialize_database
    build_application
    setup_systemd_services
    configure_firewall
    verify_deployment
    generate_summary
    
    print_success "Deployment completed successfully!"
}

# Run main function
main "$@"
