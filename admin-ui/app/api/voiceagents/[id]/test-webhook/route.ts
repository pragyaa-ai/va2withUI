import { NextRequest, NextResponse } from "next/server";

/**
 * Test webhook endpoint - sends a test payload to the configured webhook URL.
 * 
 * POST /api/voiceagents/[id]/test-webhook
 * Body: {
 *   webhookType: "si" | "waybeo",
 *   endpointUrl: string,
 *   authHeader?: string,
 *   payload: object,
 *   customerName?: string
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { webhookType, endpointUrl, authHeader, payload, customerName } = body;

    if (!endpointUrl) {
      return NextResponse.json(
        { success: false, error: "Endpoint URL is required" },
        { status: 400 }
      );
    }

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Payload is required" },
        { status: 400 }
      );
    }

    // Prepare the test payload by replacing placeholders with sample values
    const testPayload = prepareSamplePayload(payload, customerName);

    // Build headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "VoiceAgent-Admin-UI/1.0 (Webhook Test)",
    };

    if (authHeader) {
      // Auto-add "Bearer " prefix if not already present
      const normalizedAuth = normalizeAuthHeader(authHeader);
      headers["Authorization"] = normalizedAuth;
    }

    console.log(`[test-webhook] Testing ${webhookType} webhook for VoiceAgent ${params.id}`);
    console.log(`[test-webhook] URL: ${endpointUrl}`);
    console.log(`[test-webhook] Payload size: ${JSON.stringify(testPayload).length} bytes`);

    const startTime = Date.now();

    try {
      const response = await fetch(endpointUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      const duration = Date.now() - startTime;
      
      let responseBody: unknown = null;
      const contentType = response.headers.get("content-type") || "";
      
      try {
        if (contentType.includes("application/json")) {
          responseBody = await response.json();
        } else {
          responseBody = await response.text();
        }
      } catch {
        responseBody = "(Could not parse response body)";
      }

      console.log(`[test-webhook] Response: ${response.status} ${response.statusText} (${duration}ms)`);

      const normalizedAuth = authHeader ? normalizeAuthHeader(authHeader) : undefined;
      return NextResponse.json({
        success: response.ok,
        status: response.status,
        statusText: response.statusText,
        duration,
        responseBody,
        requestPayload: testPayload,
        curlCommand: generateCurlCommand(endpointUrl, normalizedAuth, testPayload),
      });
    } catch (fetchError) {
      const duration = Date.now() - startTime;
      const errorMessage = fetchError instanceof Error ? fetchError.message : "Unknown fetch error";
      const normalizedAuth = authHeader ? normalizeAuthHeader(authHeader) : undefined;
      
      console.log(`[test-webhook] Error: ${errorMessage} (${duration}ms)`);
      
      return NextResponse.json({
        success: false,
        error: errorMessage,
        duration,
        requestPayload: testPayload,
        curlCommand: generateCurlCommand(endpointUrl, normalizedAuth, testPayload),
      });
    }
  } catch (error) {
    console.error("[test-webhook] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * Normalize authorization header - auto-add "Bearer " prefix if missing
 */
function normalizeAuthHeader(authHeader: string): string {
  const trimmed = authHeader.trim();
  
  // Check if it already has a known auth scheme prefix
  const knownSchemes = ["Bearer ", "Basic ", "Token ", "Api-Key ", "Apikey "];
  const hasScheme = knownSchemes.some(scheme => 
    trimmed.toLowerCase().startsWith(scheme.toLowerCase())
  );
  
  if (hasScheme) {
    return trimmed;
  }
  
  // Auto-add Bearer prefix
  return `Bearer ${trimmed}`;
}

/**
 * Replace template placeholders with sample test values
 */
function prepareSamplePayload(
  template: unknown,
  customerName?: string
): unknown {
  if (template === null || template === undefined) {
    return template;
  }

  if (typeof template === "string") {
    // Replace placeholders with sample values
    let result = template;
    
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 19).replace("T", " ");
    const testCallId = `TEST_${Date.now()}`;
    
    const replacements: Record<string, string> = {
      "{call_id}": testCallId,
      "{customer_name}": customerName || "TestCustomer",
      "{agent_name}": customerName || "TestAgent",
      "{agent_slug}": "test-agent",
      "{store_code}": "TEST001",
      "{customer_number}": "9876543210",
      "{start_time}": dateStr,
      "{end_time}": dateStr,
      "{duration_sec}": "60",
      "{completion_status}": "complete",
      "{detected_language}": "hindi",
      "{transfer_status}": "not_transferred",
      "{transfer_reason}": "Test call",
      "{extracted.name}": "Test User",
      "{extracted.model}": "TestModel",
      "{extracted.test_drive}": "Yes",
      "{extracted.email}": "test@example.com",
      "{extracted.phone}": "9876543210",
      "{transcript_text}": "[TEST] Agent: Hello! User: Hi, this is a test.",
      "{analytics.total_exchanges}": "4",
      "{analytics.user_messages}": "2",
      "{analytics.assistant_messages}": "2",
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
      result = result.split(placeholder).join(value);
    }

    // Handle conditional expressions like {extracted.name ? 'verified' : 'not_captured'}
    result = result.replace(
      /\{[^}]+\s*\?\s*'([^']+)'\s*:\s*'([^']+)'\}/g,
      "$1" // Use the "truthy" value for test
    );

    // Handle bot_{call_id} pattern
    if (result === "bot_{call_id}") {
      result = `bot_${testCallId}`;
    }

    return result;
  }

  if (Array.isArray(template)) {
    return template.map((item) => prepareSamplePayload(item, customerName));
  }

  if (typeof template === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template as Record<string, unknown>)) {
      result[key] = prepareSamplePayload(value, customerName);
    }
    return result;
  }

  return template;
}

/**
 * Generate a curl command that users can copy and run manually
 */
function generateCurlCommand(
  url: string,
  authHeader: string | undefined,
  payload: unknown
): string {
  const escapedPayload = JSON.stringify(payload).replace(/'/g, "'\\''");
  
  let cmd = `curl -X POST '${url}' \\\n`;
  cmd += `  -H 'Content-Type: application/json' \\\n`;
  if (authHeader) {
    cmd += `  -H 'Authorization: ${authHeader}' \\\n`;
  }
  cmd += `  -d '${escapedPayload}'`;
  
  return cmd;
}
