"""
CrmService — integration service for external Somikoron CRM (sunset.somikoronitltd.com).
Fetches lead data through a secure backend proxy with session management and caching.
"""
from __future__ import annotations

import re
import time
from typing import Any, Dict, List, Optional
import httpx

from app.core.config import settings


class CrmService:
    # In-memory cache for leads and session cookies
    _cached_leads: Optional[List[Dict[str, Any]]] = None
    _cache_timestamp: float = 0
    _cookies: Optional[Dict[str, str]] = None
    _cookie_timestamp: float = 0

    CACHE_TTL_SECONDS = 300  # 5 minutes cache
    SESSION_TTL_SECONDS = 3600  # 1 hour session cookie validity

    def __init__(self) -> None:
        self.base_url = settings.CRM_BASE_URL.rstrip("/")
        self.login_url = settings.CRM_LOGIN_URL or f"{self.base_url}/login"
        self.leads_url = settings.CRM_LEADS_URL or f"{self.base_url}/crm-module/lead_data"
        self.username = settings.CRM_USERNAME
        self.password = settings.CRM_PASSWORD
        self.auth_token = settings.CRM_AUTH_TOKEN
        self.user_field = settings.CRM_USERNAME_FIELD or "email"
        self.pass_field = settings.CRM_PASSWORD_FIELD or "password"

    def is_configured(self) -> bool:
        """Check if CRM credentials or tokens are provided in settings."""
        return bool(self.auth_token or (self.username and self.password))

    async def _login_and_get_cookies(self, client: httpx.AsyncClient) -> Dict[str, str]:
        """Perform login to Somikoron CRM and extract session cookies."""
        if not self.username or not self.password:
            raise ValueError("CRM_USERNAME or CRM_PASSWORD is not configured in backend .env")

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
            "Referer": self.login_url,
        }

        # Step 1: GET the login page to capture initial session cookies and CSRF token if present
        csrf_token = None
        try:
            get_resp = await client.get(self.login_url, headers=headers)
            html = get_resp.text

            # Look for Laravel / standard CSRF tokens
            csrf_match = re.search(r'name=["\'](?:_token|csrf_token|csrf-token)["\']\s+value=["\']([^"\']+)["\']', html)
            if not csrf_match:
                csrf_match = re.search(r'name=["\']csrf-token["\']\s+content=["\']([^"\']+)["\']', html)
            if not csrf_match:
                csrf_match = re.search(r'content=["\']([^"\']+)["\']\s+name=["\']csrf-token["\']', html)

            if csrf_match:
                csrf_token = csrf_match.group(1)
        except Exception as e:
            # Login GET failed, try posting directly
            pass

        # Step 2: POST credentials
        post_data: Dict[str, Any] = {
            self.user_field: self.username,
            self.pass_field: self.password,
        }
        if csrf_token:
            post_data["_token"] = csrf_token

        post_headers = dict(headers)
        if csrf_token:
            post_headers["X-CSRF-TOKEN"] = csrf_token

        post_resp = await client.post(
            self.login_url,
            data=post_data,
            headers=post_headers,
        )

        # Check for successful login indicators (status 200, 302 redirect, or JSON success)
        cookies_dict = dict(client.cookies)
        if not cookies_dict:
            cookies_dict = dict(post_resp.cookies)

        CrmService._cookies = cookies_dict
        CrmService._cookie_timestamp = time.time()
        return cookies_dict

    async def fetch_leads(self, force_refresh: bool = False) -> Dict[str, Any]:
        """Fetch lead data from Somikoron CRM."""
        now = time.time()

        # Check in-memory cache if not forcing refresh
        if not force_refresh and CrmService._cached_leads is not None:
            if (now - CrmService._cache_timestamp) < self.CACHE_TTL_SECONDS:
                return {
                    "success": True,
                    "leads": CrmService._cached_leads,
                    "total": len(CrmService._cached_leads),
                    "from_cache": True,
                    "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(CrmService._cache_timestamp)),
                }

        if not self.is_configured():
            return {
                "success": False,
                "error": "CRM credentials not configured. Please set CRM_USERNAME and CRM_PASSWORD in your backend .env file.",
                "leads": [],
                "total": 0,
            }

        async with httpx.AsyncClient(timeout=35.0, follow_redirects=True) as client:
            # Prepare headers
            req_headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*",
                "X-Requested-With": "XMLHttpRequest",
            }

            if self.auth_token:
                req_headers["Authorization"] = f"Bearer {self.auth_token}"

            # Ensure we have active cookies if not using static auth_token
            if not self.auth_token:
                cookies_valid = (
                    CrmService._cookies is not None
                    and (now - CrmService._cookie_timestamp) < self.SESSION_TTL_SECONDS
                )
                if not cookies_valid or force_refresh:
                    try:
                        await self._login_and_get_cookies(client)
                    except Exception as e:
                        return {
                            "success": False,
                            "error": f"CRM login failed: {str(e)}",
                            "leads": [],
                            "total": 0,
                        }
                else:
                    client.cookies.update(CrmService._cookies or {})

            # Fetch the actual lead data endpoint
            try:
                resp = await client.get(self.leads_url, headers=req_headers)

                # If redirected to login page or 401/403, try re-logging in once
                if resp.status_code in (401, 403) or (resp.history and "login" in str(resp.url).lower()):
                    if not self.auth_token:
                        await self._login_and_get_cookies(client)
                        resp = await client.get(self.leads_url, headers=req_headers)

                if resp.status_code != 200:
                    return {
                        "success": False,
                        "error": f"CRM server returned status {resp.status_code}: {resp.reason_phrase}",
                        "leads": [],
                        "total": 0,
                    }

                # Try parsing response as JSON
                try:
                    data = resp.json()
                except Exception:
                    return {
                        "success": False,
                        "error": "CRM response was not valid JSON. Endpoint may have returned an HTML error or login page.",
                        "leads": [],
                        "total": 0,
                        "raw_snippet": resp.text[:400],
                    }

                # Standardize leads list from whatever format CRM returned
                raw_leads = []
                if isinstance(data, list):
                    raw_leads = data
                elif isinstance(data, dict):
                    # Check common CRM JSON wrappers: "data", "leads", "result", "rows"
                    for key in ("data", "leads", "result", "rows", "lead_data"):
                        if key in data and isinstance(data[key], list):
                            raw_leads = data[key]
                            break
                    if not raw_leads and "aaData" in data and isinstance(data["aaData"], list):
                        raw_leads = data["aaData"]

                normalized_leads = [self._normalize_lead(lead, idx + 1) for idx, lead in enumerate(raw_leads)]

                # Update in-memory cache
                CrmService._cached_leads = normalized_leads
                CrmService._cache_timestamp = now

                return {
                    "success": True,
                    "leads": normalized_leads,
                    "total": len(normalized_leads),
                    "from_cache": False,
                    "fetched_at": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(now)),
                }

            except httpx.RequestError as exc:
                return {
                    "success": False,
                    "error": f"Network error connecting to Somikoron CRM: {str(exc)}",
                    "leads": [],
                    "total": 0,
                }
            except Exception as exc:
                return {
                    "success": False,
                    "error": f"Unexpected error: {str(exc)}",
                    "leads": [],
                    "total": 0,
                }

    def _normalize_lead(self, raw: Any, index: int) -> Dict[str, Any]:
        """Normalize a CRM lead record into standardized fields."""
        if not isinstance(raw, dict):
            return {"id": index, "name": str(raw), "raw": raw}

        def pick(*keys: str) -> Optional[str]:
            for k in keys:
                if k in raw and raw[k] is not None:
                    val = str(raw[k]).strip()
                    if val and val != "null" and val != "None":
                        return val
            return None

        lead_id = pick("id", "lead_id", "leadId", "sl", "code") or str(index)
        name = pick("name", "client_name", "customer_name", "full_name", "lead_name") or "Unnamed Lead"
        phone = pick("phone", "mobile", "contact", "phone_number", "contact_no", "cell") or "—"
        email = pick("email", "email_address") or "—"
        project = pick("project", "project_name", "property", "interested_project", "product") or "—"
        status = pick("status", "lead_status", "stage", "category", "lead_type") or "New"
        source = pick("source", "lead_source", "media", "campaign", "channel") or "—"
        assigned = pick("assigned_to", "executive", "employee", "agent", "handler", "assigned_person") or "Unassigned"
        created_at = pick("created_at", "entry_date", "date", "created_date", "lead_date") or "—"
        address = pick("address", "location", "city", "area") or "—"
        profession = pick("profession", "occupation", "designation") or "—"
        notes = pick("remarks", "notes", "description", "comment", "feedback") or "—"

        return {
            "id": lead_id,
            "name": name,
            "phone": phone,
            "email": email,
            "project": project,
            "status": status,
            "source": source,
            "assigned_to": assigned,
            "created_at": created_at,
            "address": address,
            "profession": profession,
            "notes": notes,
            "raw": raw,
        }

