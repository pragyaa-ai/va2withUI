/**
 * Derive a payload template from a user-provided sample payload.
 *
 * The user pastes a real/dummy payload with sample values. This module
 * analyses the JSON structure and replaces known values with placeholders
 * like {call_id}, {extracted.name}, etc. Unknown fields are kept as-is
 * (literal values) so the output payload always matches the sample's shape.
 */

// ---------------------------------------------------------------------------
// Key-name → placeholder mapping (top-level and nested)
// ---------------------------------------------------------------------------

const KEY_PLACEHOLDER_MAP: Record<string, string> = {
  // Call identifiers
  call_ref_id: "{call_id}",
  callRefId: "{call_id}",
  ucid: "{call_id}",
  call_id: "{call_id}",

  // Agent / customer
  customer_name: "{customer_name}",
  customerName: "{customer_name}",
  agent_id: "{agent_slug}",
  agent_slug: "{agent_slug}",
  agent_name: "{agent_name}",

  // Store / caller
  store_code: "{store_code}",
  storeCode: "{store_code}",
  store: "{store_code}",
  customer_number: "{customer_number}",
  customerNumber: "{customer_number}",
  caller_number: "{customer_number}",
  callerNumber: "{customer_number}",

  // Timings
  start_time: "{start_time}",
  startTime: "{start_time}",
  call_start_time: "{start_time}",
  end_time: "{end_time}",
  endTime: "{end_time}",
  call_end_time: "{end_time}",
  duration: "{duration_sec}",
  call_duration: "{duration_sec}",
  duration_sec: "{duration_sec}",

  // Status
  completion_status: "{completion_status}",
  call_status: "{completion_status}",

  // Transcript
  transcript_text: "{transcript_text}",

  // Language / transfer (often nested, but handle at top level too)
  detected_language: "{detected_language}",
  transfer_status: "{transfer_status}",
  transfer_reason: "{transfer_reason}",
};

// Nested dot-path overrides (take priority when walking into objects)
const NESTED_PATH_MAP: Record<string, string> = {
  "language.conversational": "{detected_language}",
  "dealer_routing.status": "{transfer_status}",
  "dealer_routing.reason": "{transfer_reason}",
  "dealer_routing.time": "{end_time}",
  "dropoff.time": "{end_time}",
};

// Extracted data mappings (used inside response_data and sales_data)
const EXTRACTED_FIELD_MAP: Record<string, string> = {
  name: "{extracted.name}",
  full_name: "{extracted.name}",
  model: "{extracted.model}",
  car_model: "{extracted.model}",
  email: "{extracted.email}",
  email_id: "{extracted.email}",
  test_drive: "{extracted.test_drive}",
  test_drive_interest: "{extracted.test_drive}",
  phone: "{extracted.phone}",
};

// Analytics mappings
const ANALYTICS_FIELD_MAP: Record<string, string> = {
  total_exchanges: "{analytics.total_exchanges}",
  user_messages: "{analytics.user_messages}",
  assistant_messages: "{analytics.assistant_messages}",
};

// Keys whose values should be kept as literals (not replaced)
const KEEP_LITERAL_KEYS = new Set([
  "call_vendor",
  "callVendor",
  "recording_url",
  "recordingUrl",
  "action",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Check if a value looks like the "bot_<id>" pattern */
function looksLikeBotId(value: string): boolean {
  return /^bot_[A-Za-z0-9_-]+$/.test(value);
}

/** Check if value looks like a date/time string */
function looksLikeDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}/.test(value);
}

// ---------------------------------------------------------------------------
// Response-data array handler
// ---------------------------------------------------------------------------

/**
 * Handle the SI-style response_data array:
 * [{ key_value: "name", key_response: "Suman", ... }, ...]
 *
 * For each item, replace key_response with {extracted.<key_value>} and
 * set remarks to a conditional expression, keeping rest of the structure.
 */
function deriveResponseDataItem(
  item: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const keyValue = (item.key_value as string) || "";

  for (const [k, v] of Object.entries(item)) {
    if (k === "key_response") {
      // Replace with extracted placeholder based on key_value
      result[k] = EXTRACTED_FIELD_MAP[keyValue] || `{extracted.${keyValue}}`;
    } else if (k === "remarks") {
      const placeholder = EXTRACTED_FIELD_MAP[keyValue] || `{extracted.${keyValue}}`;
      // Strip braces to get the field name for conditional
      const field = placeholder.slice(1, -1); // e.g. "extracted.name"
      result[k] = `{${field} ? 'verified' : 'not_captured'}`;
    } else if (k === "attempts_details" && Array.isArray(v)) {
      // Keep the structure but replace time values with placeholders
      result[k] = v.map((detail: unknown) => {
        if (typeof detail !== "object" || detail === null) return detail;
        const d = detail as Record<string, unknown>;
        const mapped: Record<string, unknown> = {};
        for (const [dk, dv] of Object.entries(d)) {
          if (
            (dk === "start_time" || dk === "end_time") &&
            typeof dv === "string" &&
            looksLikeDateTime(dv)
          ) {
            // Keep the structure but note these come from transcript timestamps
            mapped[dk] = dv; // Keep literal — these are per-item timestamps
          } else {
            mapped[dk] = dv;
          }
        }
        return mapped;
      });
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Sales-data (flat extracted) handler
// ---------------------------------------------------------------------------

function deriveSalesDataObject(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (EXTRACTED_FIELD_MAP[k]) {
      result[k] = EXTRACTED_FIELD_MAP[k];
    } else {
      result[k] = typeof v === "string" ? v : v;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Analytics object handler
// ---------------------------------------------------------------------------

function deriveAnalyticsObject(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (ANALYTICS_FIELD_MAP[k]) {
      result[k] = ANALYTICS_FIELD_MAP[k];
    } else {
      result[k] = v;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Core recursive deriver
// ---------------------------------------------------------------------------

function deriveValue(
  key: string,
  value: unknown,
  parentPath: string,
): unknown {
  const fullPath = parentPath ? `${parentPath}.${key}` : key;

  // 1. Check nested path override first
  if (NESTED_PATH_MAP[fullPath] !== undefined) {
    return NESTED_PATH_MAP[fullPath];
  }

  // 2. Keep literal keys as-is
  if (KEEP_LITERAL_KEYS.has(key)) {
    return value;
  }

  // 3. Handle the "id" field with "bot_" prefix
  if (key === "id" && typeof value === "string" && looksLikeBotId(value)) {
    return "bot_{call_id}";
  }

  // 4. Handle response_data array (SI format)
  if (key === "response_data" && Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === "object" && item !== null && "key_value" in item) {
        return deriveResponseDataItem(item as Record<string, unknown>);
      }
      return item;
    });
  }

  // 5. Handle sales_data / extracted data objects
  if (
    (key === "sales_data" || key === "extracted_data" || key === "extracted") &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return deriveSalesDataObject(value as Record<string, unknown>);
  }

  // 6. Handle analytics objects
  if (
    key === "analytics" &&
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return deriveAnalyticsObject(value as Record<string, unknown>);
  }

  // 7. Check top-level key mapping
  if (KEY_PLACEHOLDER_MAP[key]) {
    return KEY_PLACEHOLDER_MAP[key];
  }

  // 8. Recurse into objects
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return deriveObject(value as Record<string, unknown>, fullPath);
  }

  // 9. Recurse into arrays
  if (Array.isArray(value)) {
    return value.map((item, i) => {
      if (typeof item === "object" && item !== null) {
        return deriveObject(item as Record<string, unknown>, `${fullPath}[${i}]`);
      }
      return item;
    });
  }

  // 10. For string values, check if they look like dates (potential time fields)
  if (typeof value === "string" && looksLikeDateTime(value) && !KEEP_LITERAL_KEYS.has(key)) {
    // If the key suggests a time field, map it
    if (/start/i.test(key)) return "{start_time}";
    if (/end/i.test(key)) return "{end_time}";
    if (/time/i.test(key)) return "{end_time}";
  }

  // 11. Keep as literal
  return value;
}

function deriveObject(
  obj: Record<string, unknown>,
  parentPath: string = "",
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = deriveValue(key, value, parentPath);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DerivationResult {
  /** The derived template (JSON object ready to stringify) */
  template: Record<string, unknown>;
  /** Fields that were auto-mapped to placeholders */
  mappedFields: string[];
  /** Fields kept as literal values (no matching placeholder) */
  literalFields: string[];
}

/**
 * Derive a payload template from a sample payload with real/dummy values.
 *
 * @param sampleJson - Raw JSON string pasted by the user
 * @returns DerivationResult with template and field info
 * @throws Error if the JSON is invalid
 */
export function deriveTemplateFromSample(sampleJson: string): DerivationResult {
  const sample = JSON.parse(sampleJson);

  if (typeof sample !== "object" || sample === null || Array.isArray(sample)) {
    throw new Error("Sample payload must be a JSON object (not an array or primitive).");
  }

  const template = deriveObject(sample as Record<string, unknown>);

  // Collect stats
  const mappedFields: string[] = [];
  const literalFields: string[] = [];

  function collectStats(
    original: Record<string, unknown>,
    derived: Record<string, unknown>,
    path: string = "",
  ) {
    for (const [key, origValue] of Object.entries(original)) {
      const fullPath = path ? `${path}.${key}` : key;
      const derivedValue = derived[key];

      if (typeof derivedValue === "string" && derivedValue.includes("{")) {
        mappedFields.push(fullPath);
      } else if (
        typeof origValue === "object" &&
        origValue !== null &&
        !Array.isArray(origValue) &&
        typeof derivedValue === "object" &&
        derivedValue !== null &&
        !Array.isArray(derivedValue)
      ) {
        collectStats(
          origValue as Record<string, unknown>,
          derivedValue as Record<string, unknown>,
          fullPath,
        );
      } else if (
        key === "response_data" &&
        Array.isArray(origValue) &&
        Array.isArray(derivedValue)
      ) {
        mappedFields.push(fullPath);
      } else if (KEEP_LITERAL_KEYS.has(key)) {
        // intentionally kept literal
      } else if (typeof origValue !== "object") {
        literalFields.push(fullPath);
      }
    }
  }

  collectStats(sample as Record<string, unknown>, template);

  return { template, mappedFields, literalFields };
}
