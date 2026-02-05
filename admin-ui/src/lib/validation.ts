import { z } from "zod";

// Voice name mapping (display name → internal name)
export const VOICE_NAMES = {
  ANANYA: "Ananya",
  PRIYA: "Priya",
  CHITRA: "Chitra",
  KAVYA: "Kavya",
  FARHAN: "Farhan",
} as const;

export const ACCENTS = {
  INDIAN: "Indian",
  AMERICAN: "American",
  BRITISH: "British",
} as const;

export const LANGUAGES = {
  ENGLISH: "English",
  HINDI: "Hindi",
} as const;

export const ENGINE_LABELS = {
  PRIMARY: "Primary",
  SECONDARY: "Secondary",
} as const;

// ---------- VoiceAgent ----------
export const createVoiceAgentSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z.string().min(1, "Slug is required").max(50).regex(/^[a-z0-9_-]+$/, "Slug must be lowercase alphanumeric with dashes/underscores"),
  phoneNumber: z.string().optional(),
  engine: z.enum(["PRIMARY", "SECONDARY"]).default("PRIMARY"),
  greeting: z.string().min(1, "Greeting is required").max(500).default("Namaste! Aapka swagat hai. Main aapki kya madad kar sakti hoon?"),
  accent: z.enum(["INDIAN", "AMERICAN", "BRITISH"]).default("INDIAN"),
  language: z.enum(["ENGLISH", "HINDI"]).default("HINDI"),
  voiceName: z.enum(["ANANYA", "PRIYA", "CHITRA", "KAVYA", "FARHAN"]).default("ANANYA"),
  isActive: z.boolean().default(true),
  systemInstructions: z.string().max(50000).optional(),
  // Payload templates for post-call webhooks (JSON objects)
  siPayloadTemplate: z.any().optional(),      // SI webhook payload structure
  waybeoPayloadTemplate: z.any().optional(),  // Waybeo callback payload structure
  // Webhook endpoints for post-call payload delivery
  siCustomerName: z.string().max(100).optional(),                     // SI customer/account name (e.g., "Kia")
  siEndpointUrl: z.string().url().optional().or(z.literal("")),       // SI webhook URL
  siAuthHeader: z.string().max(500).optional(),                       // SI Authorization header
  waybeoEndpointUrl: z.string().url().optional().or(z.literal("")),   // Waybeo callback URL
  waybeoAuthHeader: z.string().max(500).optional(),                   // Waybeo Authorization header
});

export type CreateVoiceAgentInput = z.infer<typeof createVoiceAgentSchema>;

// ---------- Call Flow ----------
export const updateCallFlowSchema = z.object({
  greeting: z.string().min(1, "Greeting is required").max(2000),
  steps: z
    .array(
      z.object({
        id: z.string().optional(),
        order: z.number().int().min(0),
        title: z.string().min(1).max(200),
        content: z.string().min(1).max(5000),
        enabled: z.boolean().default(true),
      })
    )
    .optional(),
});

export type UpdateCallFlowInput = z.infer<typeof updateCallFlowSchema>;

// ---------- Guardrail ----------
export const createGuardrailSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  ruleText: z.string().min(1, "Rule text is required").max(2000),
  enabled: z.boolean().default(true),
});

export type CreateGuardrailInput = z.infer<typeof createGuardrailSchema>;

// ---------- Voice Profile ----------
export const upsertVoiceProfileSchema = z.object({
  voiceName: z.string().min(1).max(50),
  accentNotes: z.string().max(1000).optional(),
  settingsJson: z.any().optional(),
});

export type UpsertVoiceProfileInput = z.infer<typeof upsertVoiceProfileSchema>;

// ---------- Feedback ----------
export const createFeedbackSchema = z.object({
  voiceAgentId: z.string().optional(),
  source: z.string().max(50).default("testing"),
  message: z.string().min(1, "Feedback message is required").max(5000),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
