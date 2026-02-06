type TemplateValidationResult = {
  ok: boolean;
  placeholders: string[];
  unknownPlaceholders: string[];
  transcriptDependentPlaceholders: string[];
};

const PLACEHOLDER_PATTERN = /\{([^{}]+)\}/g;
const CONDITIONAL_PATTERN = /^\s*([a-zA-Z0-9_.]+)\s*\?\s*(['"])(.*?)\2\s*:\s*(['"])(.*?)\4\s*$/;

const ALLOWED_PLACEHOLDERS = new Set([
  "call_id",
  "agent_slug",
  "agent_name",
  "customer_name",
  "store_code",
  "customer_number",
  "start_time",
  "end_time",
  "duration_sec",
  "completion_status",
  "response_data",
  "transcript",
  "transcript_text",
  "extracted.name",
  "extracted.model",
  "extracted.email",
  "extracted.test_drive",
  "extracted.phone",
  "analytics.total_exchanges",
  "analytics.user_messages",
  "analytics.assistant_messages",
]);

const TRANSCRIPT_DEPENDENT_PREFIXES = ["extracted.", "transcript", "response_data", "analytics."];

const extractPlaceholdersFromString = (value: string): string[] => {
  const placeholders: string[] = [];
  for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
    const expression = match[1]?.trim();
    if (!expression) {
      continue;
    }
    const conditional = CONDITIONAL_PATTERN.exec(expression);
    if (conditional) {
      placeholders.push(conditional[1]);
    } else {
      placeholders.push(expression);
    }
  }
  return placeholders;
};

const extractPlaceholders = (value: unknown, acc: string[] = []): string[] => {
  if (typeof value === "string") {
    acc.push(...extractPlaceholdersFromString(value));
  } else if (Array.isArray(value)) {
    value.forEach((item) => extractPlaceholders(item, acc));
  } else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach((child) =>
      extractPlaceholders(child, acc)
    );
  }
  return acc;
};

const isTranscriptDependent = (placeholder: string) =>
  TRANSCRIPT_DEPENDENT_PREFIXES.some((prefix) => placeholder.startsWith(prefix));

export const validatePayloadTemplate = (
  template: unknown
): TemplateValidationResult => {
  if (!template) {
    return {
      ok: true,
      placeholders: [],
      unknownPlaceholders: [],
      transcriptDependentPlaceholders: [],
    };
  }

  const placeholders = Array.from(new Set(extractPlaceholders(template)));
  const unknownPlaceholders = placeholders.filter((item) => !ALLOWED_PLACEHOLDERS.has(item));
  const transcriptDependentPlaceholders = placeholders.filter(isTranscriptDependent);

  return {
    ok: unknownPlaceholders.length === 0,
    placeholders,
    unknownPlaceholders,
    transcriptDependentPlaceholders,
  };
};

export type { TemplateValidationResult };
