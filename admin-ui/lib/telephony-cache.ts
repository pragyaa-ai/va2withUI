/**
 * Telephony Cache Management
 * 
 * Utilities to clear cached agent configurations in the telephony service.
 * Call these after updating agent settings to make changes take effect immediately
 * without requiring a service restart.
 */

const TELEPHONY_ADMIN_URL = process.env.NEXT_PUBLIC_TELEPHONY_ADMIN_URL || "http://localhost:8082";

export interface CacheClearResult {
  success: boolean;
  message?: string;
  agent?: string;
  cleared?: number;
  error?: string;
}

/**
 * Clear cached configuration for a specific agent or all agents.
 * This forces the telephony service to reload:
 * - System instructions
 * - VMN mappings
 * - Webhook endpoints
 * - Car models
 * 
 * @param agentSlug - Agent slug (e.g., "spotlight", "tata"), or undefined for all agents
 * @returns Promise with result status
 */
export async function clearTelephonyCache(agentSlug?: string): Promise<CacheClearResult> {
  try {
    const response = await fetch(`${TELEPHONY_ADMIN_URL}/cache/clear`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ agent: agentSlug }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error("[telephony-cache] Failed to clear cache:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get the current cache status (which agents are cached).
 * Useful for debugging and monitoring.
 */
export async function getTelephonyCacheStatus(): Promise<{
  cached_agents: string[];
  count: number;
} | null> {
  try {
    const response = await fetch(`${TELEPHONY_ADMIN_URL}/cache/status`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error("[telephony-cache] Failed to get cache status:", error);
    return null;
  }
}
