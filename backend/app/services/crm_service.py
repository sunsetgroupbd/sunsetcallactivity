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
    _cached_records_total: Optional[int] = None
    _cached_records_filtered: Optional[int] = None
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

    async def fetch_leads(
        self,
        force_refresh: bool = False,
        length: Optional[int] = None,
        start: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Fetch lead data from Somikoron CRM."""
        import urllib.parse
        now = time.time()

        # Check in-memory cache if not forcing refresh and no custom pagination
        if not force_refresh and length is None and start is None and CrmService._cached_leads is not None:
            if (now - CrmService._cache_timestamp) < self.CACHE_TTL_SECONDS:
                return {
                    "success": True,
                    "leads": CrmService._cached_leads,
                    "total": len(CrmService._cached_leads),
                    "records_total": CrmService._cached_records_total,
                    "records_filtered": CrmService._cached_records_filtered,
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

            # Build query parameters
            query_params: Dict[str, Any] = {}
            if length is not None:
                query_params["length"] = length
            if start is not None:
                query_params["start"] = start

            # Fetch the actual lead data endpoint
            try:
                resp = await client.get(self.leads_url, headers=req_headers, params=query_params or None)

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
                            resp = await client.get(self.leads_url, headers=req_headers, params=query_params or None)
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
                    resp = await client.get(self.leads_url, headers=clean_headers, params=query_params or None)

                # Fallback: If still 401, also try HTTP Basic Auth fallback on the leads URL directly
                if resp.status_code == 401 and self.username and self.password:
                    resp = await client.get(
                        self.leads_url,
                        auth=(self.username, self.password),
                        headers=req_headers,
                        params=query_params or None,
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

                # Extract recordsTotal and recordsFiltered from DataTables response
                records_total = None
                records_filtered = None
                if isinstance(data, dict):
                    records_total = data.get("recordsTotal") or data.get("total")
                    records_filtered = data.get("recordsFiltered") or data.get("filtered")

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

                # Update in-memory cache if standard request
                if length is None and start is None:
                    CrmService._cached_leads = normalized_leads
                    CrmService._cached_records_total = records_total
                    CrmService._cached_records_filtered = records_filtered
                    CrmService._cache_timestamp = now

                return {
                    "success": True,
                    "leads": normalized_leads,
                    "total": len(normalized_leads),
                    "records_total": records_total,
                    "records_filtered": records_filtered,
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

                # Inspect JSON response from CRM
                crm_keys = []
                crm_records_total = None
                crm_records_filtered = None
                crm_data_count = None
                try:
                    j3 = resp3.json()
                    if isinstance(j3, dict):
                        crm_keys = list(j3.keys())
                        crm_records_total = j3.get("recordsTotal") or j3.get("total")
                        crm_records_filtered = j3.get("recordsFiltered") or j3.get("filtered")
                        if "data" in j3 and isinstance(j3["data"], list):
                            crm_data_count = len(j3["data"])
                except Exception:
                    pass

                diagnostics["steps"].append({
                    "step": "3. GET leads_url",
                    "status_code": resp3.status_code,
                    "final_url": str(resp3.url),
                    "content_type": resp3.headers.get("content-type"),
                    "snippet": resp3.text[:300].strip(),
                    "crm_keys": crm_keys,
                    "recordsTotal": crm_records_total,
                    "recordsFiltered": crm_records_filtered,
                    "data_returned_count": crm_data_count,
                    "xsrf_header_sent": bool("X-XSRF-TOKEN" in req_headers),
                    "fallback_without_xhr_status": fallback_status,
                    "fallback_snippet": fallback_snippet,
                })

                # Probe 4: Pagination & Parameter test (length=500)
                try:
                    probe_resp = await client.get(
                        self.leads_url,
                        headers=req_headers,
                        params={"start": 0, "length": 500},
                    )
                    if probe_resp.status_code == 200:
                        pj = probe_resp.json()
                        diagnostics["steps"].append({
                            "step": "4. DataTables Pagination Probe (?length=500)",
                            "status_code": probe_resp.status_code,
                            "recordsTotal": pj.get("recordsTotal") if isinstance(pj, dict) else None,
                            "recordsFiltered": pj.get("recordsFiltered") if isinstance(pj, dict) else None,
                            "data_returned_count": len(pj.get("data", [])) if isinstance(pj, dict) and isinstance(pj.get("data"), list) else None,
                        })
                except Exception as ex_probe:
                    diagnostics["steps"].append({
                        "step": "4. DataTables Pagination Probe (?length=500)",
                        "error": str(ex_probe),
                    })
            except Exception as e:
                diagnostics["steps"].append({
                    "step": "3. GET leads_url",
                    "error": str(e),
                })

        return diagnostics

    def _normalize_lead(self, raw: Any, index: int) -> Dict[str, Any]:
        """
        Normalize a CRM lead record into standardized fields.
        Extracts structured data from HTML cells (e.g. Laravel DataTables lead-info markup).
        """
        import html as html_lib

        def strip_html(text: Any) -> str:
            if text is None:
                return ""
            s = str(text)
            # Replace breaks/divs with space
            s = re.sub(r'<(?:br|div|p|tr|td)[^>]*>', ' ', s, flags=re.I)
            # Remove tags
            s = re.sub(r'<[^>]+>', '', s)
            # Unescape entities
            s = html_lib.unescape(s)
            # Normalize whitespace
            s = re.sub(r'\s+', ' ', s).strip()
            return s

        # If raw is a list/tuple (DataTables array format)
        if isinstance(raw, (list, tuple)):
            dict_val: Dict[str, Any] = {}
            col_map = ["id", "name", "phone", "project", "status", "source", "assigned_to", "created_at", "action"]
            for i, val in enumerate(raw):
                key = col_map[i] if i < len(col_map) else f"col_{i}"
                dict_val[key] = val
            raw = dict_val
        elif not isinstance(raw, dict):
            return {"id": index, "name": str(raw), "raw": raw}

        def pick(*keys: str) -> Optional[str]:
            for k in keys:
                if k in raw and raw[k] is not None:
                    val = str(raw[k]).strip()
                    if val and val != "null" and val != "None":
                        return val
            return None

        # Check if any field contains the rich HTML lead-info block
        html_blob = ""
        for v in raw.values():
            if isinstance(v, str) and ("lead-info" in v or "lead-field" in v or "lead-details" in v):
                html_blob = v
                break

        embedded: Dict[str, str] = {}
        crm_link = None
        badge = None

        if html_blob:
            # Extract CRM details URL
            href_m = re.search(r'href=["\']([^"\']+)["\']', html_blob, re.I)
            if href_m:
                crm_link = href_m.group(1).strip()

            # Extract badge (e.g. "New Assignment")
            badge_m = re.search(r'<span[^>]*>(.*?)</span>', html_blob, re.I | re.S)
            if badge_m:
                b_text = strip_html(badge_m.group(1))
                if b_text:
                    badge = b_text

            # Extract all <div class="lead-field">Key: Value</div>
            field_matches = re.findall(r'<div[^>]*class=["\'][^"\']*lead-field[^"\']*["\'][^>]*>(.*?)</div>', html_blob, re.I | re.S)
            for fm in field_matches:
                clean_fm = strip_html(fm)
                if ":" in clean_fm:
                    k, val = clean_fm.split(":", 1)
                    embedded[k.strip().lower()] = val.strip()

        # Resolve Clean Name
        raw_name = pick("name", "client_name", "customer_name", "full_name", "lead_name")
        clean_name = embedded.get("name")
        if not clean_name and raw_name:
            clean_name = strip_html(raw_name)
            # If strip_html left "Name: XYZ" or "ID: XYZ"
            if clean_name.lower().startswith("name:"):
                clean_name = clean_name[5:].strip()
        if not clean_name or clean_name in ("—", "-"):
            clean_name = f"Lead #{index}"

        # Resolve ID and Lead Code
        embedded_id = embedded.get("id")
        raw_id = pick("id", "lead_id", "leadId", "sl", "code")
        if raw_id:
            raw_id = strip_html(raw_id)
        lead_id = raw_id or str(index)
        lead_code = embedded_id or (lead_id if lead_id != str(index) else None)

        # Resolve Phone
        raw_phone = pick("phone", "mobile", "contact", "phone_number", "contact_no", "cell")
        phone = strip_html(raw_phone) if raw_phone else "—"

        # Resolve Email and Designation
        raw_email = pick("email", "email_address")
        clean_email = strip_html(raw_email) if raw_email else ""
        designation = embedded.get("designation", "")
        organization = embedded.get("organization", "")
        if not clean_email or clean_email in ("—", "-"):
            if "@" in designation:
                clean_email = designation
                designation = ""
            elif "@" in organization:
                clean_email = organization
                organization = ""
            else:
                clean_email = "—"

        # Resolve Address & Location
        raw_address = pick("address", "location", "city", "area")
        clean_address = strip_html(raw_address) if raw_address else ""
        emb_address = embedded.get("address", "")
        if emb_address:
            if clean_address and clean_address not in ("—", "-") and clean_address != emb_address:
                clean_address = f"{emb_address}, {clean_address}"
            else:
                clean_address = emb_address
        if organization and organization != clean_address:
            if clean_address and clean_address not in ("—", "-"):
                clean_address = f"{clean_address} ({organization})"
            else:
                clean_address = organization
        if not clean_address:
            clean_address = "—"

        # Resolve Source
        raw_source = pick("source", "lead_source", "media", "campaign", "channel")
        clean_source = strip_html(raw_source) if raw_source else ""
        if not clean_source or clean_source in ("—", "-"):
            clean_source = embedded.get("source", "—")

        # Resolve Status
        raw_status = pick("status", "lead_status", "stage", "category", "lead_type")
        clean_status = strip_html(raw_status) if raw_status else "Active"
        if not clean_status or clean_status in ("—", "-"):
            clean_status = "Active"

        # Resolve Project
        raw_project = pick("project", "project_name", "property", "interested_project", "product")
        clean_project = strip_html(raw_project) if raw_project else "—"

        # Resolve Assigned To
        raw_assigned = pick("assigned_to", "executive", "employee", "agent", "handler", "assigned_person")
        clean_assigned = strip_html(raw_assigned) if raw_assigned else "Unassigned"
        if not clean_assigned or clean_assigned in ("—", "-"):
            clean_assigned = "Unassigned"

        # Resolve Created At
        raw_created = pick("created_at", "entry_date", "date", "created_date", "lead_date")
        clean_created = strip_html(raw_created) if raw_created else "—"

        # Profession
        raw_prof = pick("profession", "occupation")
        profession = strip_html(raw_prof) if raw_prof else designation or "—"

        # Notes
        raw_notes = pick("remarks", "notes", "description", "comment", "feedback")
        notes = strip_html(raw_notes) if raw_notes else "—"

        return {
            "id": lead_id,
            "lead_code": lead_code,
            "name": clean_name,
            "phone": phone,
            "email": clean_email,
            "project": clean_project,
            "status": clean_status,
            "source": clean_source,
            "assigned_to": clean_assigned,
            "created_at": clean_created,
            "address": clean_address,
            "organization": organization or None,
            "profession": profession,
            "notes": notes,
            "badge": badge,
            "crm_link": crm_link,
            "raw": raw,
        }
