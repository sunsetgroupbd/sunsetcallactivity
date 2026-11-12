"""
CrmService — integration service for external Somikoron CRM (sunset.somikoronitltd.com).
Fetches lead data through a secure backend proxy with session management, token extraction, and caching.
"""
from __future__ import annotations

import logging
import re
import time
from typing import Any, Dict, List, Optional
import httpx

from app.core.config import settings

logger = logging.getLogger("uvicorn.error")


class CrmService:
    # In-memory cache for leads, session cookies, and dynamic tokens
    _cached_leads: Optional[List[Dict[str, Any]]] = None
    _cache_timestamp: float = 0
    _cookies: Optional[Dict[str, str]] = None
    _cookie_timestamp: float = 0
    _dynamic_token: Optional[str] = None

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

    async def _login_and_get_cookies(self, client: httpx.AsyncClient) -> Dict[str, Any]:
        """
        Perform login to Somikoron CRM and extract session cookies or Bearer token.
        Supports both form-data and JSON login, and auto-detects CSRF tokens.
        """
        import urllib.parse

        if not self.username or not self.password:
            raise ValueError("CRM_USERNAME or CRM_PASSWORD is not configured in backend .env")

        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
            "Referer": self.login_url,
        }

        # Step 1: GET the login page to capture initial session cookies, CSRF token, and form action
        csrf_token = None
        form_action = self.login_url
        input_names: List[str] = []
        try:
            get_resp = await client.get(self.login_url, headers=headers, timeout=15.0)
            if get_resp.status_code == 404:
                raise ValueError(f"CRM Login URL returned 404 Not Found ({self.login_url}). Please verify CRM_LOGIN_URL in .env.")

            html = get_resp.text

            # Extract form action
            fa_m = re.search(r'<form[^>]+action=["\']([^"\']*)["\']', html, re.I)
            if fa_m and fa_m.group(1).strip():
                form_action = urllib.parse.urljoin(str(get_resp.url), fa_m.group(1).strip())

            # Extract input names
            input_names = re.findall(r'<input[^>]+name=["\']([^"\']+)["\']', html, re.I)

            # Robust CSRF token extraction
            m1 = re.search(r'<input[^>]+name=["\']_token["\'][^>]+value=["\']([^"\']+)["\']', html, re.I)
            if not m1:
                m1 = re.search(r'<input[^>]+value=["\']([^"\']+)["\'][^>]+name=["\']_token["\']', html, re.I)
            if not m1:
                m1 = re.search(r'<meta[^>]+name=["\'](?:csrf-token|csrf_token)["\'][^>]+content=["\']([^"\']+)["\']', html, re.I)
            if not m1:
                m1 = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\'](?:csrf-token|csrf_token)["\']', html, re.I)

            if m1:
                csrf_token = m1.group(1)
        except ValueError:
            raise
        except Exception as e:
            logger.warning("CRM GET login page failed or bypassed: %s", e)

        # Step 2: POST credentials
        post_data: Dict[str, Any] = {
            self.user_field: self.username,
            self.pass_field: self.password,
            "email": self.username,
            "username": self.username,
            "password": self.password,
        }
        if "user" in input_names:
            post_data["user"] = self.username
        if "login" in input_names:
            post_data["login"] = self.username

        if csrf_token:
            post_data["_token"] = csrf_token

        post_headers = dict(headers)
        post_headers["Referer"] = self.login_url
        post_headers["Origin"] = self.base_url
        if csrf_token:
            post_headers["X-CSRF-TOKEN"] = csrf_token

        if "XSRF-TOKEN" in client.cookies:
            post_headers["X-XSRF-TOKEN"] = urllib.parse.unquote(client.cookies["XSRF-TOKEN"])

        # Try form POST
        post_resp = await client.post(
            form_action,
            data=post_data,
            headers=post_headers,
            timeout=20.0,
        )

        # Check if login returned JSON token
        try:
            post_json = post_resp.json()
            if isinstance(post_json, dict):
                for tok_key in ("token", "access_token", "bearer_token", "api_token", "jwt", "key"):
                    if tok_key in post_json and isinstance(post_json[tok_key], str):
                        CrmService._dynamic_token = post_json[tok_key]
                        logger.info("Extracted CRM auth token from login response.")
                        break
        except Exception:
            pass

        cookies_dict = dict(client.cookies)
        if not cookies_dict:
            cookies_dict = dict(post_resp.cookies)

        # Check if login stayed on login page or redirected to an error
        final_url_str = str(post_resp.url).rstrip("/")
        landed_on_login = final_url_str.endswith("/login") or "/login" in final_url_str

        # Scan for explicit HTML error messages
        detected_error = None
        html_resp = post_resp.text
        html_lower = html_resp.lower()
        if "credentials do not match" in html_lower or "these credentials do not match our records" in html_lower:
            detected_error = "These credentials do not match the CRM records (Invalid username or password)."
        elif "page expired" in html_lower or "419" in html_lower:
            detected_error = "CSRF Token mismatch or Page Expired (HTTP 419)."
        elif "too many login attempts" in html_lower:
            detected_error = "Too many login attempts. Account temporarily throttled by CRM."
        else:
            err_m = re.search(r'<(?:span|div|p)[^>]*class=["\'][^"\']*(?:invalid-feedback|alert-danger|text-danger|error)[^"\']*["\'][^>]*>(.*?)</(?:span|div|p)>', html_resp, re.I | re.S)
            if err_m:
                raw_err = re.sub(r'<[^>]+>', '', err_m.group(1)).strip()
                if raw_err:
                    detected_error = raw_err

        # If form POST failed and didn't set dynamic token, try JSON POST fallback
        if (landed_on_login or post_resp.status_code in (400, 401, 419, 422)) and not CrmService._dynamic_token:
            json_headers = dict(post_headers)
            json_headers["Content-Type"] = "application/json"
            json_headers["Accept"] = "application/json"
            json_resp = await client.post(
                form_action,
                json=post_data,
                headers=json_headers,
                timeout=20.0,
            )
            try:
                post_json = json_resp.json()
                if isinstance(post_json, dict):
                    for tok_key in ("token", "access_token", "bearer_token", "api_token", "jwt", "key"):
                        if tok_key in post_json and isinstance(post_json[tok_key], str):
                            CrmService._dynamic_token = post_json[tok_key]
                            break
            except Exception:
                pass
            if json_resp.cookies:
                cookies_dict.update(dict(json_resp.cookies))

        if landed_on_login and not CrmService._dynamic_token and detected_error:
            raise ValueError(f"CRM Login Failed: {detected_error}")

        CrmService._cookies = cookies_dict
        CrmService._cookie_timestamp = time.time()
        return {
            "status_code": post_resp.status_code,
            "final_url": final_url_str,
            "cookies": list(cookies_dict.keys()),
            "has_token": bool(CrmService._dynamic_token),
            "inputs_detected": input_names,
            "form_action": form_action,
            "detected_error": detected_error,
            "landed_on_login": landed_on_login,
        }

    async def fetch_leads(self, force_refresh: bool = False) -> Dict[str, Any]:
        """Fetch lead data from Somikoron CRM."""
        import urllib.parse
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
            # Prepare headers with stateful origin and referer
            req_headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "application/json, text/plain, */*",
                "X-Requested-With": "XMLHttpRequest",
                "Referer": f"{self.base_url}/",
                "Origin": self.base_url,
            }

            active_token = self.auth_token or CrmService._dynamic_token
            if active_token:
                req_headers["Authorization"] = f"Bearer {active_token}"

            # Ensure we have active cookies if not using static auth_token
            if not self.auth_token:
                cookies_valid = (
                    CrmService._cookies is not None
                    and (now - CrmService._cookie_timestamp) < self.SESSION_TTL_SECONDS
                )
                if not cookies_valid or force_refresh:
                    try:
                        await self._login_and_get_cookies(client)
                        active_token = self.auth_token or CrmService._dynamic_token
                        if active_token:
                            req_headers["Authorization"] = f"Bearer {active_token}"
                    except Exception as e:
                        return {
                            "success": False,
                            "error": f"CRM login failed: {str(e)}",
                            "leads": [],
                            "total": 0,
                        }
                else:
                    client.cookies.update(CrmService._cookies or {})

            # Attach X-XSRF-TOKEN header if cookie is present
            if "XSRF-TOKEN" in client.cookies:
                req_headers["X-XSRF-TOKEN"] = urllib.parse.unquote(client.cookies["XSRF-TOKEN"])
            elif CrmService._cookies and "XSRF-TOKEN" in CrmService._cookies:
                req_headers["X-XSRF-TOKEN"] = urllib.parse.unquote(CrmService._cookies["XSRF-TOKEN"])

            # Fetch the actual lead data endpoint
            try:
                resp = await client.get(self.leads_url, headers=req_headers)

                # If redirected to login page or 401/403, try re-logging in once
                if resp.status_code in (401, 403) or (resp.history and "login" in str(resp.url).lower()):
                    if not self.auth_token:
                        # Clear old cookies/tokens and retry login
                        CrmService._cookies = None
                        CrmService._dynamic_token = None
                        client.cookies.clear()

                        try:
                            await self._login_and_get_cookies(client)
                            active_token = self.auth_token or CrmService._dynamic_token
                            if active_token:
                                req_headers["Authorization"] = f"Bearer {active_token}"
                            if "XSRF-TOKEN" in client.cookies:
                                req_headers["X-XSRF-TOKEN"] = urllib.parse.unquote(client.cookies["XSRF-TOKEN"])
                            resp = await client.get(self.leads_url, headers=req_headers)
                        except Exception as e:
                            return {
                                "success": False,
                                "error": f"CRM authentication failed: {str(e)}",
                                "leads": [],
                                "total": 0,
                            }

                # Fallback: If still 401, try without X-Requested-With (standard browser GET)
                if resp.status_code == 401:
                    clean_headers = dict(req_headers)
                    clean_headers.pop("X-Requested-With", None)
                    clean_headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8"
                    resp = await client.get(self.leads_url, headers=clean_headers)

                # Fallback: If still 401, also try HTTP Basic Auth fallback on the leads URL directly
                if resp.status_code == 401 and self.username and self.password:
                    resp = await client.get(
                        self.leads_url,
                        auth=(self.username, self.password),
                        headers=req_headers,
                    )

                if resp.status_code != 200:
                    snippet = resp.text[:250].strip()
                    return {
                        "success": False,
                        "error": f"CRM server returned status {resp.status_code}: {resp.reason_phrase}. {snippet}",
                        "leads": [],
                        "total": 0,
                        "status_code": resp.status_code,
                    }

                # Try parsing response as JSON
                try:
                    data = resp.json()
                except Exception:
                    snippet = resp.text[:400].strip()
                    return {
                        "success": False,
                        "error": "CRM endpoint did not return valid JSON. (It may have returned an HTML login or error page).",
                        "leads": [],
                        "total": 0,
                        "raw_snippet": snippet,
                    }

                # Standardize leads list from whatever format CRM returned
                raw_leads = []
                if isinstance(data, list):
                    raw_leads = data
                elif isinstance(data, dict):
                    # Check common CRM JSON wrappers: "data", "leads", "result", "rows"
                    for key in ("data", "leads", "result", "rows", "lead_data", "items"):
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
                    "error": f"Network error connecting to Somikoron CRM ({self.leads_url}): {str(exc)}",
                    "leads": [],
                    "total": 0,
                }
            except Exception as exc:
                return {
                    "success": False,
                    "error": f"Unexpected error while fetching CRM leads: {str(exc)}",
                    "leads": [],
                    "total": 0,
                }

    async def debug_connection(self) -> Dict[str, Any]:
        """Diagnostic probe for testing CRM connection step-by-step."""
        diagnostics: Dict[str, Any] = {
            "configured": self.is_configured(),
            "base_url": self.base_url,
            "login_url": self.login_url,
            "leads_url": self.leads_url,
            "username": self.username,
            "has_password": bool(self.password),
            "has_auth_token": bool(self.auth_token),
            "steps": [],
        }

        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            # Probe 1: GET login URL
            import urllib.parse
            html = ""
            try:
                resp1 = await client.get(self.login_url)
                html = resp1.text
                input_names = re.findall(r'<input[^>]+name=["\']([^"\']+)["\']', html, re.I)
                fa_m = re.search(r'<form[^>]+action=["\']([^"\']*)["\']', html, re.I)
                form_action = fa_m.group(1).strip() if fa_m else self.login_url
                diagnostics["steps"].append({
                    "step": "1. GET login_url",
                    "url": self.login_url,
                    "status_code": resp1.status_code,
                    "final_url": str(resp1.url),
                    "cookies_set": list(client.cookies.keys()),
                    "form_action": form_action,
                    "inputs_found": input_names[:10],
                    "is_html": "text/html" in resp1.headers.get("content-type", ""),
                })
            except Exception as e:
                diagnostics["steps"].append({
                    "step": "1. GET login_url",
                    "error": str(e),
                })
                return diagnostics

            # Probe 2: POST login
            try:
                login_info = await self._login_and_get_cookies(client)
                diagnostics["steps"].append({
                    "step": "2. POST login",
                    "result": login_info,
                })
            except Exception as e:
                diagnostics["steps"].append({
                    "step": "2. POST login",
                    "error": str(e),
                })

            # Probe 3: GET leads URL (with stateful headers)
            try:
                req_headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                    "Accept": "application/json, text/plain, */*",
                    "X-Requested-With": "XMLHttpRequest",
                    "Referer": f"{self.base_url}/",
                    "Origin": self.base_url,
                }
                if "XSRF-TOKEN" in client.cookies:
                    req_headers["X-XSRF-TOKEN"] = urllib.parse.unquote(client.cookies["XSRF-TOKEN"])

                active_token = self.auth_token or CrmService._dynamic_token
                if active_token:
                    req_headers["Authorization"] = f"Bearer {active_token}"

                resp3 = await client.get(self.leads_url, headers=req_headers)

                # Fallback probe if 401: try standard browser request without XMLHttpRequest
                fallback_status = None
                fallback_snippet = None
                if resp3.status_code == 401:
                    clean_headers = dict(req_headers)
                    clean_headers.pop("X-Requested-With", None)
                    clean_headers["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8"
                    fb_resp = await client.get(self.leads_url, headers=clean_headers)
                    fallback_status = fb_resp.status_code
                    fallback_snippet = fb_resp.text[:200].strip()

                diagnostics["steps"].append({
                    "step": "3. GET leads_url",
                    "status_code": resp3.status_code,
                    "final_url": str(resp3.url),
                    "content_type": resp3.headers.get("content-type"),
                    "snippet": resp3.text[:300].strip(),
                    "xsrf_header_sent": bool("X-XSRF-TOKEN" in req_headers),
                    "fallback_without_xhr_status": fallback_status,
                    "fallback_snippet": fallback_snippet,
                })
            except Exception as e:
                diagnostics["steps"].append({
                    "step": "3. GET leads_url",
                    "error": str(e),
                })

        return diagnostics

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
