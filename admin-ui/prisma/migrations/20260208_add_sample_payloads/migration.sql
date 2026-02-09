-- Add saved sample payload fields to VoiceAgent for reference/comparison
-- These store the original sample payloads used to derive templates

ALTER TABLE "VoiceAgent" ADD COLUMN IF NOT EXISTS "siSamplePayload" JSONB;
ALTER TABLE "VoiceAgent" ADD COLUMN IF NOT EXISTS "waybeoSamplePayload" JSONB;

-- Add webhook response columns to CallSession for storing API responses
-- These store the raw HTTP responses from SI and Waybeo webhook deliveries

ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "siWebhookResponse" JSONB;
ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "waybeoWebhookResponse" JSONB;

-- Add Waybeo headers column to CallSession for storing raw HTTP headers
-- received from Waybeo at call start (contains callid, caller number, store code)
ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "waybeoHeaders" JSONB;
