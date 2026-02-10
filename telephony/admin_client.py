"""
Admin UI API client for pushing call data.

Sends SI payloads to the Admin UI /api/calls/ingest endpoint
for storage in the database and analytics visualization.

Also handles webhook delivery to external SI and Waybeo endpoints.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Dict, Optional

from config import Config


def normalize_auth_header(auth_header: str) -> str:
    """
    Normalize authorization header - auto-add 'Bearer ' prefix if missing.
    
    Args:
        auth_header: Raw auth header value
        
    Returns:
        Normalized auth header with proper scheme prefix
    """
    trimmed = auth_header.strip()
    
    # Check if it already has a known auth scheme prefix
    known_schemes = ["bearer ", "basic ", "token ", "api-key ", "apikey "]
    has_scheme = any(trimmed.lower().startswith(scheme) for scheme in known_schemes)
    
    if has_scheme:
        return trimmed
    
    # Auto-add Bearer prefix
    return f"Bearer {trimmed}"


class AdminClient:
    """Async client for Admin UI API and webhook delivery."""

    def __init__(self, cfg: Optional[Config] = None):
        self.cfg = cfg or Config()
        self.base_url = self.cfg.ADMIN_API_BASE.rstrip("/")
        self.ingest_url = f"{self.base_url}/api/calls/ingest"
        self.timeout = 10  # seconds
        self._agent_config_cache: Dict[str, Dict[str, Any]] = {}

    async def push_call_data(
        self,
        payload: Dict[str, Any],
        call_id: str,
    ) -> bool:
        """
        Push call data to Admin UI for database storage.

        This is fire-and-forget with error logging - doesn't block call flow.

        Args:
            payload: SI webhook format payload
            call_id: Call ID for logging

        Returns:
            True if successful, False otherwise
        """
        if not self.cfg.ENABLE_ADMIN_PUSH:
            return False

        try:
            # Use aiohttp if available, fall back to sync urllib
            return await self._push_with_urllib(payload, call_id)
        except Exception as e:
            print(f"[{call_id}] ❌ Admin push failed: {e}")
            return False

    async def _push_with_urllib(
        self,
        payload: Dict[str, Any],
        call_id: str,
    ) -> bool:
        """Push using urllib (sync, but run in executor for async)."""
        import urllib.request
        import urllib.error

        def do_request() -> bool:
            url = self.ingest_url
            max_redirects = 3
            
            for attempt in range(max_redirects + 1):
                try:
                    data = json.dumps(payload).encode("utf-8")
                    req = urllib.request.Request(
                        url,
                        data=data,
                        method="POST",
                        headers={
                            "Content-Type": "application/json",
                            "Accept": "application/json",
                        },
                    )

                    # Create opener that doesn't auto-follow redirects
                    class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
                        def redirect_request(self, req, fp, code, msg, headers, newurl):
                            # Return None to not auto-follow, we'll handle manually
                            return None

                    opener = urllib.request.build_opener(NoRedirectHandler)
                    
                    try:
                        resp = opener.open(req, timeout=self.timeout)
                        if resp.status == 200:
                            result = json.loads(resp.read().decode("utf-8"))
                            print(f"[{call_id}] ✅ Pushed to Admin UI: {result.get('callSessionId', 'OK')}")
                            return True
                        else:
                            print(f"[{call_id}] ⚠️ Admin UI returned status {resp.status}")
                            return False
                    except urllib.error.HTTPError as e:
                        # Handle redirects (307, 308 preserve method)
                        if e.code in (301, 302, 303, 307, 308):
                            new_url = e.headers.get("Location")
                            if new_url and attempt < max_redirects:
                                # Handle relative URLs
                                if new_url.startswith("/"):
                                    new_url = f"{self.base_url}{new_url}"
                                print(f"[{call_id}] 🔄 Following redirect to: {new_url}")
                                url = new_url
                                continue
                        raise

                except urllib.error.HTTPError as e:
                    print(f"[{call_id}] ⚠️ Admin UI HTTP error: {e.code} {e.reason}")
                    return False
                except urllib.error.URLError as e:
                    print(f"[{call_id}] ⚠️ Admin UI connection error: {e.reason}")
                    return False
                except Exception as e:
                    print(f"[{call_id}] ⚠️ Admin UI request error: {e}")
                    return False
            
            print(f"[{call_id}] ⚠️ Too many redirects")
            return False

        # Run sync request in thread pool to not block event loop
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, do_request)

    async def push_call_data_fire_and_forget(
        self,
        payload: Dict[str, Any],
        call_id: str,
    ) -> None:
        """
        Push call data without waiting for result.
        Errors are logged but don't affect caller.
        """
        try:
            asyncio.create_task(self.push_call_data(payload, call_id))
        except Exception as e:
            print(f"[{call_id}] ⚠️ Failed to schedule Admin push: {e}")

    def fetch_agent_config(self, agent_slug: str) -> Optional[Dict[str, Any]]:
        """
        Fetch agent configuration including webhook endpoints.
        
        Args:
            agent_slug: Agent slug (e.g., "spotlight", "tata", "skoda")
            
        Returns:
            Agent config dict or None if not found
        """
        # Check cache first
        if agent_slug in self._agent_config_cache:
            return self._agent_config_cache[agent_slug]
        
        import urllib.request
        import urllib.error
        from collections import OrderedDict
        
        url = f"{self.base_url}/api/telephony/prompt/{agent_slug}"
        
        try:
            req = urllib.request.Request(url, method="GET")
            req.add_header("Accept", "application/json")
            
            with urllib.request.urlopen(req, timeout=5) as resp:
                if resp.status == 200:
                    # Use object_pairs_hook to preserve field order in templates
                    config = json.loads(
                        resp.read().decode("utf-8"),
                        object_pairs_hook=OrderedDict
                    )
                    self._agent_config_cache[agent_slug] = config
                    return config
        except urllib.error.HTTPError as e:
            print(f"[telephony] ⚠️ Failed to fetch config for {agent_slug}: HTTP {e.code}")
        except Exception as e:
            print(f"[telephony] ⚠️ Failed to fetch config for {agent_slug}: {e}")
        
        return None

    async def push_to_external_webhook(
        self,
        payload: Dict[str, Any],
        endpoint_url: str,
        auth_header: Optional[str],
        call_id: str,
        webhook_name: str = "webhook",
    ) -> Dict[str, Any]:
        """
        Push payload to an external webhook endpoint.
        
        Args:
            payload: JSON payload to send
            endpoint_url: Destination URL
            auth_header: Authorization header value (e.g., "Bearer xxx")
            call_id: Call ID for logging
            webhook_name: Name for logging (e.g., "SI", "Waybeo")
            
        Returns:
            Dict with {success, status_code, response_body} for storage
        """
        if not endpoint_url:
            return {"success": False, "status_code": 0, "response_body": "No endpoint configured"}
        
        # Log the payload being sent (truncated for readability)
        payload_json = json.dumps(payload, indent=2)
        if len(payload_json) > 1000:
            payload_preview = payload_json[:1000] + "\n  ... (truncated)"
        else:
            payload_preview = payload_json
        print(f"[{call_id}] 📤 {webhook_name} Payload:\n{payload_preview}")
        
        import urllib.request
        import urllib.error
        
        def do_request() -> Dict[str, Any]:
            try:
                data = json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(
                    endpoint_url,
                    data=data,
                    method="POST",
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "User-Agent": "KiaVoiceAgent/1.0",
                    },
                )
                
                # Add authorization header if provided (auto-add Bearer prefix if missing)
                if auth_header:
                    normalized_auth = normalize_auth_header(auth_header)
                    req.add_header("Authorization", normalized_auth)
                
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    response_body = resp.read().decode("utf-8")
                    if resp.status in (200, 201, 202):
                        print(f"[{call_id}] ✅ {webhook_name} webhook delivered: {resp.status}")
                        return {"success": True, "status_code": resp.status, "response_body": response_body}
                    else:
                        print(f"[{call_id}] ⚠️ {webhook_name} webhook returned: {resp.status}")
                        return {"success": False, "status_code": resp.status, "response_body": response_body}
                        
            except urllib.error.HTTPError as e:
                error_body = ""
                try:
                    error_body = e.read().decode("utf-8")[:500]
                except:
                    pass
                print(f"[{call_id}] ❌ {webhook_name} webhook HTTP error: {e.code} {e.reason}")
                if error_body:
                    print(f"[{call_id}]    Response: {error_body[:200]}")
                return {"success": False, "status_code": e.code, "response_body": error_body or f"{e.code} {e.reason}"}
            except urllib.error.URLError as e:
                print(f"[{call_id}] ❌ {webhook_name} webhook connection error: {e.reason}")
                return {"success": False, "status_code": 0, "response_body": f"Connection error: {e.reason}"}
            except Exception as e:
                print(f"[{call_id}] ❌ {webhook_name} webhook error: {e}")
                return {"success": False, "status_code": 0, "response_body": f"Error: {e}"}
        
        # Run sync request in thread pool to not block event loop
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, do_request)

    async def push_to_si_webhook(
        self,
        payload: Dict[str, Any],
        endpoint_url: str,
        auth_header: Optional[str],
        call_id: str,
    ) -> Dict[str, Any]:
        """
        Push SI payload to configured Single Interface endpoint.
        
        Args:
            payload: SI format payload
            endpoint_url: SI webhook URL
            auth_header: Authorization header (e.g., "Bearer xxx")
            call_id: Call ID for logging
            
        Returns:
            Dict with {success, status_code, response_body}
        """
        return await self.push_to_external_webhook(
            payload=payload,
            endpoint_url=endpoint_url,
            auth_header=auth_header,
            call_id=call_id,
            webhook_name="SI",
        )

    async def push_to_waybeo_webhook(
        self,
        payload: Dict[str, Any],
        endpoint_url: str,
        auth_header: Optional[str],
        call_id: str,
    ) -> Dict[str, Any]:
        """
        Push Waybeo payload to configured Waybeo endpoint.
        
        Args:
            payload: Waybeo format payload
            endpoint_url: Waybeo webhook URL
            auth_header: Authorization header (e.g., "Bearer xxx")
            call_id: Call ID for logging
            
        Returns:
            Dict with {success, status_code, response_body}
        """
        return await self.push_to_external_webhook(
            payload=payload,
            endpoint_url=endpoint_url,
            auth_header=auth_header,
            call_id=call_id,
            webhook_name="Waybeo",
        )
