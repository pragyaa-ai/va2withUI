#!/bin/bash

# ============================================================================
# VA2withUI Schema Renamer Utility
# ============================================================================
#
# This utility automates domain model renames across the codebase.
# It updates schema, seed data, API routes, validation, and frontend files.
#
# Usage:
#   bash deploy/utils/schema_renamer.sh <mapping_file.json>
#
# Example mapping file:
#   {
#     "tables": {
#       "CarModel": "DoctorProfile",
#       "VmnMapping": "VmnMapping"
#     },
#     "columns": {
#       "CarModel.modelName": "DoctorProfile.doctorName",
#       "VmnMapping.storeCode": "VmnMapping.hospitalCode"
#     },
#     "relations": {
#       "VoiceAgent.carModels": "VoiceAgent.doctorProfiles"
#     },
#     "terminology": {
#       "car model": "doctor",
#       "Car Model": "Doctor",
#       "store code": "hospital code"
#     }
#   }
#
# ============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Check arguments
if [ $# -ne 1 ]; then
    print_error "Usage: $0 <mapping_file.json>"
    exit 1
fi

MAPPING_FILE="$1"

if [ ! -f "$MAPPING_FILE" ]; then
    print_error "Mapping file not found: $MAPPING_FILE"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    print_error "jq is required but not installed. Install with: sudo apt install jq"
    exit 1
fi

print_info "Schema Renamer Utility"
print_info "Mapping file: $MAPPING_FILE"
echo ""

# Parse JSON mapping
TABLES=$(jq -r '.tables // {} | to_entries | .[] | "\(.key):\(.value)"' "$MAPPING_FILE")
COLUMNS=$(jq -r '.columns // {} | to_entries | .[] | "\(.key):\(.value)"' "$MAPPING_FILE")
RELATIONS=$(jq -r '.relations // {} | to_entries | .[] | "\(.key):\(.value)"' "$MAPPING_FILE")
TERMINOLOGY=$(jq -r '.terminology // {} | to_entries | .[] | "\(.key):\(.value)"' "$MAPPING_FILE")

# Backup files
backup_files() {
    print_info "Creating backups..."
    
    cp admin-ui/prisma/schema.prisma admin-ui/prisma/schema.prisma.backup
    print_success "Backed up schema.prisma"
    
    cp admin-ui/prisma/seed.ts admin-ui/prisma/seed.ts.backup
    print_success "Backed up seed.ts"
    
    cp admin-ui/src/lib/validation.ts admin-ui/src/lib/validation.ts.backup
    print_success "Backed up validation.ts"
}

# Update Prisma schema
update_schema() {
    print_info "Updating Prisma schema..."
    
    local schema_file="admin-ui/prisma/schema.prisma"
    
    # Update table names
    while IFS=: read -r old_name new_name; do
        if [ -n "$old_name" ] && [ -n "$new_name" ]; then
            print_info "  Renaming table: $old_name → $new_name"
            sed -i "s/model $old_name {/model $new_name {/g" "$schema_file"
        fi
    done <<< "$TABLES"
    
    # Update column names
    while IFS=: read -r old_col new_col; do
        if [ -n "$old_col" ] && [ -n "$new_col" ]; then
            # Parse table.column format
            old_field=$(echo "$old_col" | cut -d'.' -f2)
            new_field=$(echo "$new_col" | cut -d'.' -f2)
            
            if [ "$old_field" != "$new_field" ]; then
                print_info "  Renaming column: $old_field → $new_field"
                sed -i "s/  $old_field /  $new_field /g" "$schema_file"
                # Also update in @@unique constraints
                sed -i "s/\[$old_field\]/[$new_field]/g" "$schema_file"
            fi
        fi
    done <<< "$COLUMNS"
    
    # Update relations
    while IFS=: read -r old_rel new_rel; do
        if [ -n "$old_rel" ] && [ -n "$new_rel" ]; then
            old_field=$(echo "$old_rel" | cut -d'.' -f2)
            new_field=$(echo "$new_rel" | cut -d'.' -f2)
            
            print_info "  Renaming relation: $old_field → $new_field"
            sed -i "s/  $old_field /  $new_field /g" "$schema_file"
        fi
    done <<< "$RELATIONS"
    
    print_success "Schema updated"
}

# Update seed file
update_seed() {
    print_info "Updating seed file..."
    
    local seed_file="admin-ui/prisma/seed.ts"
    
    # Update table references in Prisma client calls
    while IFS=: read -r old_name new_name; do
        if [ -n "$old_name" ] && [ -n "$new_name" ]; then
            # Convert to camelCase for Prisma client
            old_camel=$(echo "$old_name" | sed 's/\(.\)\([A-Z]\)/\1\L\2/g' | sed 's/^./\L&/')
            new_camel=$(echo "$new_name" | sed 's/\(.\)\([A-Z]\)/\1\L\2/g' | sed 's/^./\L&/')
            
            print_info "  Updating prisma.$old_camel → prisma.$new_camel"
            sed -i "s/prisma\.$old_camel/prisma.$new_camel/g" "$seed_file"
        fi
    done <<< "$TABLES"
    
    # Update column references
    while IFS=: read -r old_col new_col; do
        if [ -n "$old_col" ] && [ -n "$new_col" ]; then
            old_field=$(echo "$old_col" | cut -d'.' -f2)
            new_field=$(echo "$new_col" | cut -d'.' -f2)
            
            if [ "$old_field" != "$new_field" ]; then
                print_info "  Updating field: $old_field → $new_field"
                sed -i "s/\b$old_field:/$new_field:/g" "$seed_file"
                sed -i "s/\b$old_field,/$new_field,/g" "$seed_file"
                sed -i "s/\.$old_field/$new_field/g" "$seed_file"
            fi
        fi
    done <<< "$COLUMNS"
    
    # Update variable names
    while IFS=: read -r old_term new_term; do
        if [ -n "$old_term" ] && [ -n "$new_term" ]; then
            # Convert to variable names (snake_case and camelCase)
            old_snake=$(echo "$old_term" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')
            new_snake=$(echo "$new_term" | tr '[:upper:]' '[:lower:]' | tr ' ' '_')
            
            if [ "$old_snake" != "$new_snake" ]; then
                print_info "  Updating variable: $old_snake → $new_snake"
                sed -i "s/\b$old_snake\b/$new_snake/g" "$seed_file"
            fi
        fi
    done <<< "$TERMINOLOGY"
    
    print_success "Seed file updated"
}

# Update API routes
update_api_routes() {
    print_info "Updating API routes..."
    
    # Update column/field names in all API route files
    while IFS=: read -r old_col new_col; do
        if [ -n "$old_col" ] && [ -n "$new_col" ]; then
            old_field=$(echo "$old_col" | cut -d'.' -f2)
            new_field=$(echo "$new_col" | cut -d'.' -f2)
            
            if [ "$old_field" != "$new_field" ]; then
                print_info "  Updating $old_field → $new_field in API routes"
                find admin-ui/app/api/ -name "*.ts" -type f -exec sed -i "s/\b$old_field\b/$new_field/g" {} \;
            fi
        fi
    done <<< "$COLUMNS"
    
    # Update model names (camelCase)
    while IFS=: read -r old_name new_name; do
        if [ -n "$old_name" ] && [ -n "$new_name" ]; then
            old_camel=$(echo "$old_name" | sed 's/\(.\)\([A-Z]\)/\1\L\2/g' | sed 's/^./\L&/')
            new_camel=$(echo "$new_name" | sed 's/\(.\)\([A-Z]\)/\1\L\2/g' | sed 's/^./\L&/')
            
            if [ "$old_camel" != "$new_camel" ]; then
                print_info "  Updating prisma.$old_camel → prisma.$new_camel in API routes"
                find admin-ui/app/api/ -name "*.ts" -type f -exec sed -i "s/prisma\.$old_camel/prisma.$new_camel/g" {} \;
            fi
        fi
    done <<< "$TABLES"
    
    # Update terminology in comments and strings
    while IFS=: read -r old_term new_term; do
        if [ -n "$old_term" ] && [ -n "$new_term" ]; then
            print_info "  Updating terminology: '$old_term' → '$new_term'"
            find admin-ui/app/api/ -name "*.ts" -type f -exec sed -i "s/$old_term/$new_term/g" {} \;
        fi
    done <<< "$TERMINOLOGY"
    
    print_success "API routes updated"
}

# Rename directories
rename_directories() {
    print_info "Renaming directories..."
    
    while IFS=: read -r old_name new_name; do
        if [ -n "$old_name" ] && [ -n "$new_name" ]; then
            old_kebab=$(echo "$old_name" | sed 's/\([A-Z]\)/-\L\1/g' | sed 's/^-//')
            new_kebab=$(echo "$new_name" | sed 's/\([A-Z]\)/-\L\1/g' | sed 's/^-//')
            
            # Find and rename directories in API routes
            old_dir="admin-ui/app/api/voiceagents/[id]/$old_kebab"
            new_dir="admin-ui/app/api/voiceagents/[id]/$new_kebab"
            
            if [ -d "$old_dir" ]; then
                print_info "  Renaming directory: $old_kebab → $new_kebab"
                mv "$old_dir" "$new_dir"
            fi
        fi
    done <<< "$TABLES"
    
    print_success "Directories renamed"
}

# Update validation schemas
update_validation() {
    print_info "Updating validation schemas..."
    
    local validation_file="admin-ui/src/lib/validation.ts"
    
    # Update column names
    while IFS=: read -r old_col new_col; do
        if [ -n "$old_col" ] && [ -n "$new_col" ]; then
            old_field=$(echo "$old_col" | cut -d'.' -f2)
            new_field=$(echo "$new_col" | cut -d'.' -f2)
            
            if [ "$old_field" != "$new_field" ]; then
                print_info "  Updating validation: $old_field → $new_field"
                sed -i "s/\b$old_field:/$new_field:/g" "$validation_file"
                sed -i "s/\"$old_field\"/\"$new_field\"/g" "$validation_file"
            fi
        fi
    done <<< "$COLUMNS"
    
    # Update schema names
    while IFS=: read -r old_name new_name; do
        if [ -n "$old_name" ] && [ -n "$new_name" ]; then
            old_camel=$(echo "$old_name" | sed 's/\(.\)\([A-Z]\)/\1\L\2/g' | sed 's/^./\L&/')
            new_camel=$(echo "$new_name" | sed 's/\(.\)\([A-Z]\)/\1\L\2/g' | sed 's/^./\L&/')
            
            print_info "  Updating schema: create${old_name}Schema → create${new_name}Schema"
            sed -i "s/create${old_name}Schema/create${new_name}Schema/g" "$validation_file"
        fi
    done <<< "$TABLES"
    
    print_success "Validation schemas updated"
}

# Create migration file
create_migration() {
    print_info "Creating migration file..."
    
    local migration_dir="admin-ui/prisma/migrations/$(date +%Y%m%d)_domain_rename"
    mkdir -p "$migration_dir"
    
    local migration_file="$migration_dir/migration.sql"
    
    cat > "$migration_file" <<EOF
-- Migration: Domain Model Rename
-- Generated by schema_renamer.sh on $(date)

BEGIN;

EOF
    
    # Add table renames
    while IFS=: read -r old_name new_name; do
        if [ -n "$old_name" ] && [ -n "$new_name" ] && [ "$old_name" != "$new_name" ]; then
            echo "-- Rename table: $old_name → $new_name" >> "$migration_file"
            echo "ALTER TABLE \"$old_name\" RENAME TO \"$new_name\";" >> "$migration_file"
            echo "" >> "$migration_file"
        fi
    done <<< "$TABLES"
    
    # Add column renames
    while IFS=: read -r old_col new_col; do
        if [ -n "$old_col" ] && [ -n "$new_col" ]; then
            table=$(echo "$new_col" | cut -d'.' -f1)
            old_field=$(echo "$old_col" | cut -d'.' -f2)
            new_field=$(echo "$new_col" | cut -d'.' -f2)
            
            if [ "$old_field" != "$new_field" ]; then
                echo "-- Rename column: $table.$old_field → $new_field" >> "$migration_file"
                echo "ALTER TABLE \"$table\" RENAME COLUMN \"$old_field\" TO \"$new_field\";" >> "$migration_file"
                echo "" >> "$migration_file"
            fi
        fi
    done <<< "$COLUMNS"
    
    echo "COMMIT;" >> "$migration_file"
    
    print_success "Migration file created: $migration_file"
}

# Validate TypeScript
validate_typescript() {
    print_info "Validating TypeScript compilation..."
    
    cd admin-ui
    if npx tsc --noEmit > /dev/null 2>&1; then
        print_success "TypeScript compilation successful"
    else
        print_warning "TypeScript compilation has errors. Run 'npx tsc --noEmit' to see details."
    fi
    cd ..
}

# Main execution
main() {
    echo ""
    echo "========================================"
    echo "Schema Renamer Utility"
    echo "========================================"
    echo ""
    
    backup_files
    echo ""
    
    update_schema
    echo ""
    
    update_seed
    echo ""
    
    rename_directories
    echo ""
    
    update_api_routes
    echo ""
    
    update_validation
    echo ""
    
    create_migration
    echo ""
    
    validate_typescript
    echo ""
    
    echo "========================================"
    echo "Rename Complete!"
    echo "========================================"
    echo ""
    echo "Next steps:"
    echo "  1. Review changes: git diff"
    echo "  2. Regenerate Prisma client: cd admin-ui && npx prisma generate"
    echo "  3. Clear Next.js cache: rm -rf admin-ui/.next"
    echo "  4. Test compilation: cd admin-ui && npm run build"
    echo "  5. Apply migration: cd admin-ui && npx prisma migrate deploy"
    echo ""
    echo "Backups saved with .backup extension"
    echo ""
}

main "$@"
