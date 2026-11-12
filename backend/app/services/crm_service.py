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
        import os
        from pathlib import Path
        from dotenv import dotenv_values

        # Dynamically load backend/.env on every request so changes take effect immediately
        env_path = Path(__file__).resolve().parent.parent.parent / ".env"
        env_vals = dotenv_values(str(env_path)) if env_path.exists() else {}

        self.base_url = (env_vals.get("CRM_BASE_URL") or os.getenv("CRM_BASE_URL") or settings.CRM_BASE_URL).rstrip("/")
        self.login_url = env_vals.get("CRM_LOGIN_URL") or os.getenv("CRM_LOGIN_URL") or settings.CRM_LOGIN_URL or f"{self.base_url}/login"
        self.leads_url = env_vals.get("CRM_LEADS_URL") or os.getenv("CRM_LEADS_URL") or settings.CRM_LEADS_URL or f"{self.base_url}/crm-module/lead_data"
        self.username = env_vals.get("CRM_USERNAME") or os.getenv("CRM_USERNAME") or settings.CRM_USERNAME
        self.password = env_vals.get("CRM_PASSWORD") or os.getenv("CRM_PASSWORD") or settings.CRM_PASSWORD
        self.auth_token = env_vals.get("CRM_AUTH_TOKEN") or os.getenv("CRM_AUTH_TOKEN") or settings.CRM_AUTH_TOKEN
        self.user_field = env_vals.get("CRM_USERNAME_FIELD") or os.getenv("CRM_USERNAME_FIELD") or settings.CRM_USERNAME_FIELD or "email"
        self.pass_field = env_vals.get("CRM_PASSWORD_FIELD") or os.getenv("CRM_PASSWORD_FIELD") or settings.CRM_PASSWORD_FIELD or "password"

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
        length: Optional[int] = 100,
        start: Optional[int] = 0,
        search_query: Optional[str] = None,
        from_date: Optional[str] = "1971-01-01",
        to_date: Optional[str] = None,
        active_status: Optional[str] = "Active",
        order_column: Optional[int] = 0,
        order_dir: Optional[str] = "desc",
        team_id: Optional[str] = None,
        lead_cat_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Fetch lead data from Somikoron CRM with full DataTables pagination and filter support."""
        import urllib.parse
        from datetime import datetime
        now = time.time()
        today_str = datetime.now().strftime("%Y-%m-%d")

        effective_from = from_date if from_date is not None else "1971-01-01"
        effective_to = to_date if to_date is not None else today_str
        effective_status = "Active" if (active_status is None or active_status == "Active") else ("" if str(active_status).lower() == "all" else active_status)
        effective_order_dir = order_dir or "desc"

        # Cache key based on start, length, search, dates, status, order
        is_default_query = (
            start == 0 and length == 100 and not search_query and
            effective_from == "1971-01-01" and
            effective_status == "Active" and
            effective_order_dir == "desc"
        )
        if not force_refresh and is_default_query and CrmService._cached_leads is not None and CrmService._cached_records_total is not None:
            if (now - CrmService._cache_timestamp) < self.CACHE_TTL_SECONDS:
                return {
                    "success": True,
                    "leads": CrmService._cached_leads,
                    "total": len(CrmService._cached_leads),
                    "records_total": CrmService._cached_records_total,
                    "records_filtered": CrmService._cached_records_filtered,
                    "start": 0,
                    "length": 100,
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

            # Build full DataTables query parameters exactly as Somikoron CRM expects
            query_params: Dict[str, Any] = {
                "draw": 1,
                "start": start or 0,
                "length": length if length is not None else 100,
                "search[value]": search_query or "",
                "search[regex]": "false",
                "order[0][column]": str(order_column if order_column is not None else 0),
                "order[0][dir]": effective_order_dir,
                "team_id": team_id or "",
                "lead_cat_id": lead_cat_id or "",
                "converted_customer": "",
                "keyword": search_query or "",
                "special_date": "",
                "active_status": effective_status,
                "from_date": effective_from,
                "to_date": effective_to,
                "_": int(time.time() * 1000),
            }

            # Exact DataTables column mapping matching Somikoron CRM
            columns_spec = [
                ("id", "id", "true", "true"),
                ("checkbox", "checkbox", "false", "false"),
                ("name", "leads.name", "true", "true"),
                ("mobile", "mobile", "true", "true"),
                ("user_id", "user_id", "true", "true"),
                ("cr_name", "cr_name", "true", "true"),
                ("last_Activity", "last_Activity", "true", "true"),
                ("next_Activity", "next_Activity", "true", "true"),
                ("action", "action", "true", "true"),
            ]
            for idx, (col_data, col_name, col_searchable, col_orderable) in enumerate(columns_spec):
                pfx = f"columns[{idx}]"
                query_params[f"{pfx}[data]"] = col_data
                query_params[f"{pfx}[name]"] = col_name
                query_params[f"{pfx}[searchable]"] = col_searchable
                query_params[f"{pfx}[orderable]"] = col_orderable
                query_params[f"{pfx}[search][value]"] = ""
                query_params[f"{pfx}[search][regex]"] = "false"

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
                    # If HTML page was returned (e.g. user pointed to an HTML view like add-lead-account),
                    # attempt to auto-detect the real DataTables AJAX endpoint from the HTML script!
                    html_text = resp.text
                    ajax_m = re.search(r'ajax\s*:\s*(?:{\s*url\s*:\s*)?["\']([^"\']+)["\']', html_text, re.I)
                    detected_url = None
                    if ajax_m and ajax_m.group(1).strip():
                        detected_url = urllib.parse.urljoin(str(resp.url), ajax_m.group(1).strip())
                    else:
                        crm_matches = re.findall(r'["\'](/crm-module/[^"\']+)["\']', html_text, re.I)
                        clean_crm = [m for m in crm_matches if "logout" not in m and "login" not in m and "add-lead-account" not in m]
                        if clean_crm:
                            detected_url = urllib.parse.urljoin(str(resp.url), clean_crm[0])

                    if detected_url and detected_url != str(resp.url):
                        logger.info("Auto-detected DataTables AJAX endpoint from HTML page: %s", detected_url)
                        resp = await client.get(detected_url, headers=req_headers, params=query_params or None)
                        try:
                            data = resp.json()
                        except Exception:
                            snippet = resp.text[:400].strip()
                            return {
                                "success": False,
                                "error": f"Detected CRM AJAX URL ({detected_url}) returned non-JSON response.",
                                "leads": [],
                                "total": 0,
                                "raw_snippet": snippet,
                            }
                    else:
                        snippet = resp.text[:400].strip()
                        return {
                            "success": False,
                            "error": f"CRM endpoint ({self.leads_url}) returned an HTML page rather than JSON, and no AJAX endpoint was detected.",
                            "leads": [],
                            "total": 0,
                            "raw_snippet": snippet,
                        }

                # Extract recordsTotal and recordsFiltered from DataTables response
                records_total = None
                records_filtered = None
                if isinstance(data, dict):
                    for k in ("recordsTotal", "records_total", "total", "iTotalRecords", "count", "total_records"):
                        if k in data and data[k] is not None:
                            try:
                                records_total = int(data[k])
                                break
                            except (ValueError, TypeError):
                                pass

                    for k in ("recordsFiltered", "records_filtered", "filtered", "iTotalDisplayRecords", "filtered_records"):
                        if k in data and data[k] is not None:
                            try:
                                records_filtered = int(data[k])
                                break
                            except (ValueError, TypeError):
                                pass

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

                base_index = start or 0
                normalized_leads = [self._normalize_lead(lead, base_index + idx + 1) for idx, lead in enumerate(raw_leads)]

                # Update in-memory cache if default query
                if is_default_query:
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
                    "start": start,
                    "length": length,
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

                # Probe 4: Automated Parameter & Endpoint Discovery
                probe_variants = [
                    {"label": "Standard (start=0, length=100)", "params": {"start": 0, "length": 100}},
                    {"label": "Filter: status=all", "params": {"start": 0, "length": 100, "status": "all"}},
                    {"label": "Filter: status= (empty)", "params": {"start": 0, "length": 100, "status": ""}},
                    {"label": "Filter: lead_type=all", "params": {"start": 0, "length": 100, "lead_type": "all"}},
                    {"label": "Filter: type=all", "params": {"start": 0, "length": 100, "type": "all"}},
                    {"label": "Filter: account_id=all", "params": {"start": 0, "length": 100, "account_id": "all"}},
                    {"label": "Filter: account_id= (empty)", "params": {"start": 0, "length": 100, "account_id": ""}},
                    {"label": "Filter: from_date/to_date (All Time)", "params": {"start": 0, "length": 100, "from_date": "2020-01-01", "to_date": "2030-12-31"}},
                    {"label": "Filter: date_from/date_to (All Time)", "params": {"start": 0, "length": 100, "date_from": "2020-01-01", "date_to": "2030-12-31"}},
                    {"label": "Filter: start_date/end_date (All Time)", "params": {"start": 0, "length": 100, "start_date": "2020-01-01", "end_date": "2030-12-31"}},
                    {"label": "Filter: daterange=all", "params": {"start": 0, "length": 100, "daterange": "all"}},
                    {"label": "Filter: date_range=2020-01-01 - 2030-12-31", "params": {"start": 0, "length": 100, "date_range": "2020-01-01 - 2030-12-31"}},
                    {"label": "Filter: all_leads=1", "params": {"start": 0, "length": 100, "all_leads": "1"}},
                    {"label": "Filter: all=1", "params": {"start": 0, "length": 100, "all": "1"}},
                    {"label": "Filter: lead_stage=all", "params": {"start": 0, "length": 100, "lead_stage": "all"}},
                    {"label": "Filter: stage=all", "params": {"start": 0, "length": 100, "stage": "all"}},
                    {"label": "Filter: user_id=all", "params": {"start": 0, "length": 100, "user_id": "all"}},
                ]

                # Also test alternate candidate endpoints in Probe 4
                candidate_endpoints = [
                    f"{self.base_url}/crm-module/lead_data",
                    f"{self.base_url}/crm-module/lead-list",
                    f"{self.base_url}/crm-module/all_leads",
                    f"{self.base_url}/crm-module/all-leads",
                    f"{self.base_url}/crm-module/lead-account-data",
                    f"{self.base_url}/crm-module/lead-data",
                ]

                probe_results = []
                discovered_all_leads_params = None
                for pv in probe_variants:
                    try:
                        p_resp = await client.get(
                            f"{self.base_url}/crm-module/lead_data",
                            headers=req_headers,
                            params=pv["params"],
                            timeout=10.0,
                        )
                        if p_resp.status_code == 200:
                            pj = p_resp.json()
                            if isinstance(pj, dict):
                                rt = pj.get("recordsTotal") or pj.get("total")
                                rf = pj.get("recordsFiltered") or pj.get("filtered")
                                cnt = len(pj.get("data", [])) if isinstance(pj.get("data"), list) else 0
                                probe_results.append({
                                    "test": pv["label"],
                                    "recordsTotal": rt,
                                    "recordsFiltered": rf,
                                    "returned": cnt,
                                })
                                # If any filter yields 50k+ records
                                if (rt and int(rt) > 1000) or (rf and int(rf) > 1000):
                                    discovered_all_leads_params = pv["params"]
                    except Exception as e_pv:
                        probe_results.append({"test": pv["label"], "error": str(e_pv)})

                diagnostics["steps"].append({
                    "step": "4. Parameter Discovery on lead_data",
                    "results": probe_results,
                    "discovered_working_params": discovered_all_leads_params,
                })

                # Probe 4b: Test Alternate CRM Endpoints
                endpoint_results = []
                for ep in candidate_endpoints:
                    try:
                        ep_resp = await client.get(
                            ep,
                            headers=req_headers,
                            params={"start": 0, "length": 100},
                            timeout=8.0,
                        )
                        ep_rt = None
                        ep_rf = None
                        ep_cnt = None
                        if ep_resp.status_code == 200:
                            try:
                                ep_j = ep_resp.json()
                                if isinstance(ep_j, dict):
                                    ep_rt = ep_j.get("recordsTotal") or ep_j.get("total")
                                    ep_rf = ep_j.get("recordsFiltered") or ep_j.get("filtered")
                                    if "data" in ep_j and isinstance(ep_j["data"], list):
                                        ep_cnt = len(ep_j["data"])
                            except Exception:
                                pass
                        endpoint_results.append({
                            "endpoint": ep.replace(self.base_url, ""),
                            "status": ep_resp.status_code,
                            "recordsTotal": ep_rt,
                            "recordsFiltered": ep_rf,
                            "count": ep_cnt,
                        })
                    except Exception as e_ep:
                        endpoint_results.append({
                            "endpoint": ep.replace(self.base_url, ""),
                            "error": str(e_ep),
                        })

                diagnostics["steps"].append({
                    "step": "4b. Candidate Endpoint Probing",
                    "results": endpoint_results,
                })

                # Probe 5: Inspect add-lead-account URL
                try:
                    target_url = f"{self.base_url}/crm-module/add-lead-account"
                    # First GET as HTML (browser view)
                    h_resp = await client.get(
                        target_url,
                        headers={
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                            "Referer": f"{self.base_url}/",
                        },
                    )

                    ajax_endpoints = []
                    dt_urls = []
                    if h_resp.status_code == 200:
                        html_content = h_resp.text
                        ajax_matches = re.findall(r'ajax\s*:\s*(?:{\s*url\s*:\s*)?["\']([^"\']+)["\']', html_content, re.I)
                        crm_urls = re.findall(r'["\'](/crm-module/[^"\']+)["\']', html_content, re.I)
                        ajax_endpoints = list(set([u for u in (ajax_matches + crm_urls) if "logout" not in u and "login" not in u]))

                        # Extract script URLs
                        scripts = re.findall(r'<script[^>]*>([\s\S]*?)</script>', html_content, re.I)
                        for scr in scripts:
                            if "datatable" in scr.lower() or "ajax" in scr.lower() or "lead" in scr.lower():
                                u_m = re.findall(r'(?:url|ajax)\s*:\s*["\']([^"\']+)["\']', scr, re.I)
                                dt_urls.extend(u_m)

                    # Second GET as AJAX (JSON DataTables)
                    a_resp = await client.get(
                        target_url,
                        headers=req_headers,
                        params={"start": 0, "length": 100},
                    )
                    a_total = None
                    a_count = None
                    try:
                        j_a = a_resp.json()
                        if isinstance(j_a, dict):
                            a_total = j_a.get("recordsTotal") or j_a.get("total")
                            if "data" in j_a and isinstance(j_a["data"], list):
                                a_count = len(j_a["data"])
                    except Exception:
                        pass

                    diagnostics["steps"].append({
                        "step": "5. Probe add-lead-account",
                        "url": target_url,
                        "html_status": h_resp.status_code,
                        "detected_ajax_urls": ajax_endpoints[:10],
                        "script_datatable_urls": list(set(dt_urls)),
                        "ajax_status": a_resp.status_code,
                        "ajax_recordsTotal": a_total,
                        "ajax_data_count": a_count,
                        "ajax_snippet": a_resp.text[:200].strip(),
                    })
                except Exception as e_add:
                    diagnostics["steps"].append({
                        "step": "5. Probe add-lead-account",
                        "error": str(e_add),
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
            col_map = ["id", "checkbox", "name", "mobile", "user_id", "cr_name", "last_Activity", "next_Activity", "action"]
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
        raw_assigned = pick("cr_name", "user_id", "assigned_to", "executive", "employee", "agent", "handler", "assigned_person")
        clean_assigned = strip_html(raw_assigned) if raw_assigned else "Unassigned"
        if not clean_assigned or clean_assigned in ("—", "-"):
            clean_assigned = "Unassigned"

        # Resolve Created At
        raw_created = pick("created_at", "entry_date", "date", "created_date", "lead_date")
        clean_created = strip_html(raw_created) if raw_created else "—"

        # Last & Next Activity
        raw_last_act = pick("last_Activity", "last_activity")
        last_activity = strip_html(raw_last_act) if raw_last_act else None
        raw_next_act = pick("next_Activity", "next_activity")
        next_activity = strip_html(raw_next_act) if raw_next_act else None

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
            "last_activity": last_activity,
            "next_activity": next_activity,
            "raw": raw,
        }
