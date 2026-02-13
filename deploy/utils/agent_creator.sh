#!/bin/bash

# ============================================================================
# VA2withUI Voice Agent Creator Utility
# ============================================================================
#
# This utility creates voice agents using three different methods:
#   1. SQL - Direct SQL INSERT statements
#   2. API - REST API calls to Admin UI
#   3. Seed - Append to Prisma seed file
#
# Usage:
#   bash deploy/utils/agent_creator.sh [method]
#
# Methods:
#   sql   - Generate SQL file
#   api   - Create via API calls (requires Admin UI running)
#   seed  - Append to seed file
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

# Default method
METHOD="${1:-sql}"

# Voice options
VOICES=("ANANYA" "SHIMMER" "AOEDE" "PUCK" "CHARON" "KORE" "FENRIR")
ACCENTS=("INDIAN" "AMERICAN" "BRITISH" "AUSTRALIAN")
LANGUAGES=("ENGLISH" "HINDI" "GUJARATI" "MARATHI" "TAMIL" "TELUGU" "KANNADA" "MALAYALAM")
ENGINES=("PRIMARY" "SECONDARY")

# Agent data storage
declare -a AGENT_NAMES
declare -a AGENT_SLUGS
declare -a AGENT_PHONES
declare -a AGENT_ENGINES
declare -a AGENT_GREETINGS
declare -a AGENT_ACCENTS
declare -a AGENT_LANGUAGES
declare -a AGENT_VOICES
declare -a AGENT_INSTRUCTIONS

# ============================================================================
# Helper Functions
# ============================================================================

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

prompt_multiline() {
    local prompt="$1"
    local var_name="$2"
    
    echo "$prompt (Press Ctrl+D when done)"
    local content=$(cat)
    eval "$var_name=\"$content\""
}

prompt_file() {
    local prompt="$1"
    local var_name="$2"
    
    read -p "$prompt: " filepath
    
    if [ -f "$filepath" ]; then
        local content=$(cat "$filepath")
        eval "$var_name=\"$content\""
        print_success "Loaded file: $filepath"
    else
        print_error "File not found: $filepath"
        eval "$var_name=\"\""
    fi
}

prompt_choice() {
    local prompt="$1"
    shift
    local options=("$@")
    
    echo "$prompt"
    for i in "${!options[@]}"; do
        echo "  $((i+1))) ${options[$i]}"
    done
    
    while true; do
        read -p "Enter choice [1-${#options[@]}]: " choice
        if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le "${#options[@]}" ]; then
            echo "${options[$((choice-1))]}"
            return 0
        else
            print_error "Invalid choice. Please enter a number between 1 and ${#options[@]}."
        fi
    done
}

# ============================================================================
# Collect Agent Information
# ============================================================================

collect_agent_info() {
    local agent_num="$1"
    
    echo ""
    echo "========================================"
    echo "Agent #$agent_num Details"
    echo "========================================"
    
    # Name
    prompt_input "Agent Name (e.g., 'Artemis Hospital')" "" name
    AGENT_NAMES+=("$name")
    
    # Slug
    default_slug=$(echo "$name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')
    prompt_input "Agent Slug" "$default_slug" slug
    AGENT_SLUGS+=("$slug")
    
    # Phone number
    prompt_input "Phone Number (optional)" "" phone
    AGENT_PHONES+=("$phone")
    
    # Engine
    engine=$(prompt_choice "Engine" "${ENGINES[@]}")
    AGENT_ENGINES+=("$engine")
    
    # Greeting
    prompt_input "Greeting" "Namaskar, welcome to $name. How may I help you today?" greeting
    AGENT_GREETINGS+=("$greeting")
    
    # Accent
    accent=$(prompt_choice "Accent" "${ACCENTS[@]}")
    AGENT_ACCENTS+=("$accent")
    
    # Language
    language=$(prompt_choice "Language" "${LANGUAGES[@]}")
    AGENT_LANGUAGES+=("$language")
    
    # Voice
    voice=$(prompt_choice "Voice" "${VOICES[@]}")
    AGENT_VOICES+=("$voice")
    
    # System Instructions
    echo ""
    echo "System Instructions (choose input method):"
    echo "  1) Type inline (multiline)"
    echo "  2) Load from file"
    echo "  3) Use default template"
    read -p "Choice [1-3]: " instr_choice
    
    case $instr_choice in
        1)
            prompt_multiline "Enter system instructions" instructions
            ;;
        2)
            prompt_file "File path" instructions
            ;;
        *)
            instructions="Agent Name: $name
Voice: $voice
Role: Customer service representative
Purpose: Assist customers with inquiries and provide information

Critical Features:
1. INDIAN ACCENT (MANDATORY)
2. LANGUAGE SUPPORT (${language})
3. GREETING & INITIAL FLOW
4. PROFESSIONAL AND HELPFUL

Key Personality Traits:
- Demeanor: Respectful, empathetic, supportive
- Tone: Soft, warm, conversational
- Accent: Distinct ${accent}"
            ;;
    esac
    AGENT_INSTRUCTIONS+=("$instructions")
    
    print_success "Agent #$agent_num details collected"
}

# ============================================================================
# Method 1: SQL Generation
# ============================================================================

generate_sql() {
    local output_file="/tmp/create_agents_$(date +%Y%m%d_%H%M%S).sql"
    
    print_info "Generating SQL file: $output_file"
    
    cat > "$output_file" <<EOF
-- ============================================================================
-- Voice Agents Creation Script
-- Generated on $(date)
-- ============================================================================

BEGIN;

EOF
    
    for i in "${!AGENT_NAMES[@]}"; do
        # Escape single quotes in strings
        local name="${AGENT_NAMES[$i]//\'/\'\'}"
        local slug="${AGENT_SLUGS[$i]//\'/\'\'}"
        local phone="${AGENT_PHONES[$i]//\'/\'\'}"
        local greeting="${AGENT_GREETINGS[$i]//\'/\'\'}"
        local instructions="${AGENT_INSTRUCTIONS[$i]//\'/\'\'}"
        
        cat >> "$output_file" <<EOF
-- Agent: ${AGENT_NAMES[$i]}
INSERT INTO "VoiceAgent" (
  id,
  name,
  slug,
  "phoneNumber",
  engine,
  "isActive",
  "isLive",
  greeting,
  accent,
  language,
  "voiceName",
  "systemInstructions",
  "createdAt",
  "updatedAt"
) VALUES (
  gen_random_uuid()::text,
  '$name',
  '$slug',
  '$phone',
  '${AGENT_ENGINES[$i]}',
  true,
  false,
  '$greeting',
  '${AGENT_ACCENTS[$i]}',
  '${AGENT_LANGUAGES[$i]}',
  '${AGENT_VOICES[$i]}',
  '$instructions',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  greeting = EXCLUDED.greeting,
  "systemInstructions" = EXCLUDED."systemInstructions",
  "updatedAt" = CURRENT_TIMESTAMP;

EOF
    done
    
    cat >> "$output_file" <<EOF
COMMIT;

-- Verify
SELECT name, slug, "isLive", "isActive", language, "voiceName" 
FROM "VoiceAgent" 
WHERE slug IN ($(printf "'%s', " "${AGENT_SLUGS[@]}" | sed 's/, $//')))
ORDER BY name;
EOF
    
    print_success "SQL file generated: $output_file"
    echo ""
    echo "To apply:"
    echo "  psql -h 127.0.0.1 -U voiceagent_user -d YOUR_DB_NAME -f $output_file"
}

# ============================================================================
# Method 2: API Creation
# ============================================================================

create_via_api() {
    local admin_url="$1"
    
    if [ -z "$admin_url" ]; then
        prompt_input "Admin UI URL" "http://localhost:3100" admin_url
    fi
    
    print_info "Creating agents via API: $admin_url"
    
    # Check if Admin UI is accessible
    if ! curl -s -o /dev/null -w "%{http_code}" "$admin_url" | grep -q "200\|307"; then
        print_error "Admin UI is not accessible at $admin_url"
        return 1
    fi
    
    for i in "${!AGENT_NAMES[@]}"; do
        print_info "Creating agent: ${AGENT_NAMES[$i]}..."
        
        # Build JSON payload
        local payload=$(cat <<EOF
{
  "name": "${AGENT_NAMES[$i]}",
  "slug": "${AGENT_SLUGS[$i]}",
  "phoneNumber": "${AGENT_PHONES[$i]}",
  "engine": "${AGENT_ENGINES[$i]}",
  "greeting": "${AGENT_GREETINGS[$i]}",
  "accent": "${AGENT_ACCENTS[$i]}",
  "language": "${AGENT_LANGUAGES[$i]}",
  "voiceName": "${AGENT_VOICES[$i]}",
  "systemInstructions": $(echo "${AGENT_INSTRUCTIONS[$i]}" | jq -Rs .)
}
EOF
)
        
        # Make API call
        response=$(curl -s -X POST "$admin_url/api/voiceagents" \
            -H "Content-Type: application/json" \
            -d "$payload")
        
        # Check response
        if echo "$response" | jq -e '.id' > /dev/null 2>&1; then
            agent_id=$(echo "$response" | jq -r '.id')
            print_success "Agent created: ${AGENT_NAMES[$i]} (ID: $agent_id)"
        else
            print_error "Failed to create agent: ${AGENT_NAMES[$i]}"
            print_error "Response: $response"
        fi
    done
}

# ============================================================================
# Method 3: Seed File Append
# ============================================================================

append_to_seed() {
    local seed_file="admin-ui/prisma/seed.ts"
    
    if [ ! -f "$seed_file" ]; then
        print_error "Seed file not found: $seed_file"
        return 1
    fi
    
    print_info "Appending agents to seed file..."
    
    # Create backup
    cp "$seed_file" "${seed_file}.backup"
    print_success "Backup created: ${seed_file}.backup"
    
    # Find insertion point (before main() execution)
    local insert_marker="main()"
    
    # Generate agent definitions
    local agent_code=""
    
    for i in "${!AGENT_NAMES[@]}"; do
        # Escape backticks and dollar signs for TypeScript
        local instructions="${AGENT_INSTRUCTIONS[$i]//\`/\\\`}"
        instructions="${instructions//\$/\\\$}"
        
        agent_code+="
// Agent: ${AGENT_NAMES[$i]}
const agent_$i = await prisma.voiceAgent.upsert({
  where: { slug: \"${AGENT_SLUGS[$i]}\" },
  update: {
    name: \"${AGENT_NAMES[$i]}\",
    phoneNumber: \"${AGENT_PHONES[$i]}\",
    greeting: \`${AGENT_GREETINGS[$i]}\`,
    systemInstructions: \`${instructions}\`,
  },
  create: {
    name: \"${AGENT_NAMES[$i]}\",
    slug: \"${AGENT_SLUGS[$i]}\",
    phoneNumber: \"${AGENT_PHONES[$i]}\",
    engine: \"${AGENT_ENGINES[$i]}\",
    greeting: \`${AGENT_GREETINGS[$i]}\`,
    accent: \"${AGENT_ACCENTS[$i]}\",
    language: \"${AGENT_LANGUAGES[$i]}\",
    voiceName: \"${AGENT_VOICES[$i]}\",
    isActive: true,
    isLive: false,
    systemInstructions: \`${instructions}\`,
  },
});
console.log(\"Upserted ${AGENT_NAMES[$i]}: \" + agent_$i.id + \" (slug: ${AGENT_SLUGS[$i]})\");
"
    done
    
    # Insert before main() execution
    local temp_file="${seed_file}.tmp"
    awk -v code="$agent_code" '/^main\(\)/ {print code} {print}' "$seed_file" > "$temp_file"
    mv "$temp_file" "$seed_file"
    
    print_success "Agents appended to seed file"
    echo ""
    echo "To apply:"
    echo "  cd admin-ui"
    echo "  npx prisma db seed"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
    echo ""
    echo "========================================"
    echo "Voice Agent Creator Utility"
    echo "========================================"
    echo ""
    
    # Validate method
    case "$METHOD" in
        sql|api|seed)
            print_info "Method: $METHOD"
            ;;
        *)
            print_error "Invalid method: $METHOD"
            echo "Valid methods: sql, api, seed"
            exit 1
            ;;
    esac
    
    # Get number of agents
    echo ""
    read -p "How many agents to create? " num_agents
    
    if ! [[ "$num_agents" =~ ^[0-9]+$ ]] || [ "$num_agents" -lt 1 ]; then
        print_error "Invalid number of agents"
        exit 1
    fi
    
    # Collect information for each agent
    for ((i=1; i<=num_agents; i++)); do
        collect_agent_info "$i"
    done
    
    # Execute method
    echo ""
    echo "========================================"
    echo "Creating Agents"
    echo "========================================"
    
    case "$METHOD" in
        sql)
            generate_sql
            ;;
        api)
            create_via_api ""
            ;;
        seed)
            append_to_seed
            ;;
    esac
    
    echo ""
    print_success "Agent creation complete!"
}

main "$@"
