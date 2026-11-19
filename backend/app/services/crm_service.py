"""
CrmService — integration service for external Somikoron CRM (sunset.somikoronitltd.com).
Fetches lead data through a secure backend proxy with session management, token extraction, and caching.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
from pathlib import Path
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

    # Full 50,000+ Lead Pipeline Aggregation Cache & Live Background Task State
    _cached_full_pipeline: Optional[Dict[str, Any]] = None
    _sync_state: Dict[str, Any] = {
        "running": False,
        "current": 0,
        "total": 0,
        "percent": 0,
        "status": "idle",
        "started_at": None,
        "completed_at": None,
        "error": None,
    }
    _sync_cancel_requested: bool = False
    _sync_task: Optional[asyncio.Task] = None

    CACHE_TTL_SECONDS = 300  # 5 minutes cache
    SESSION_TTL_SECONDS = 3600  # 1 hour session cookie validity

    @classmethod
    def _cache_file_path(cls) -> Path:
        return Path(__file__).resolve().parent.parent.parent / "crm_pipeline_cache.json"

    @classmethod
    def _load_pipeline_cache(cls) -> Optional[Dict[str, Any]]:
        if cls._cached_full_pipeline:
            return cls._cached_full_pipeline
        fpath = cls._cache_file_path()
        if fpath.exists():
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    cls._cached_full_pipeline = data
                    return data
            except Exception as e:
                logger.warning("Failed to read crm_pipeline_cache.json: %s", e)
        return None

    @classmethod
    def _save_pipeline_cache(cls, data: Dict[str, Any]) -> None:
        cls._cached_full_pipeline = data
        fpath = cls._cache_file_path()
        try:
            with open(fpath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning("Failed to save crm_pipeline_cache.json: %s", e)

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

        effective_from = from_date if from_date is not None else "2010-01-01"
        effective_to = to_date if to_date is not None else "2030-12-31"
        effective_status = "Active" if (active_status is None or active_status == "Active") else ("" if str(active_status).lower() == "all" else active_status)
        effective_order_dir = order_dir or "desc"

        # Cache key based on start, length, search, dates, status, order
        is_default_query = (
            start == 0 and length == 100 and not search_query and
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

            # Build query parameters exactly as Somikoron CRM expects
            clean_search = (search_query or "").strip()
            query_params: Dict[str, Any] = {
                "draw": 1,
                "start": start or 0,
                "length": length if length is not None else 100,
                "team_id": team_id or "",
                "lead_cat_id": lead_cat_id or "",
                "converted_customer": "",
                "keyword": clean_search,
                "special_date": "",
                "active_status": effective_status,
                "from_date": effective_from,
                "to_date": effective_to,
                "_": int(time.time() * 1000),
            }

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

    async def get_pipeline_summary(self, force_refresh: bool = False, limit: int = 1500) -> Dict[str, Any]:
        """
        Aggregate leads from Somikoron CRM grouped by assigned executive:
        - HP, Potential, Follow Up counts per executive
        - Unassigned leads count and samples
        - Total CRM leads
        """
        # If full sync cache exists on disk or in memory and not forcing a fresh live sample
        cached = self._load_pipeline_cache()
        if cached and not force_refresh:
            return cached

        fetch_len = min(limit, 5000)
        res = await self.fetch_leads(
            force_refresh=force_refresh,
            length=fetch_len,
            start=0,
            from_date="1971-01-01",
            active_status="Active",
        )
        if not res.get("success", False):
            # If fetch failed but we have cached data, return cached
            if cached:
                return cached
            return res

        leads = res.get("leads", [])
        records_total = res.get("records_total") or len(leads)

        exec_map: Dict[str, Dict[str, Any]] = {}
        unassigned_leads: List[Dict[str, Any]] = []
        statuses_found: set[str] = set()
        status_counts: Dict[str, int] = {}
        sources_found: set[str] = set()
        source_counts: Dict[str, int] = {}

        total_hp = 0
        total_p = 0
        total_fup = 0
        total_other = 0

        for lead in leads:
            assigned = (lead.get("assigned_to") or "").strip()
            status_val = (lead.get("status") or "").strip()
            badge_val = (lead.get("badge") or "").strip()
            cat_val = (lead.get("lead_category") or "").strip()

            # Determine the best stage representation (prefer specific stage over generic "Active")
            if cat_val and cat_val not in ("—", "-"):
                raw_status = cat_val
            elif status_val and status_val.lower() not in ("active", "—", "-"):
                raw_status = status_val
            elif badge_val and badge_val.lower() not in ("active", "—", "-"):
                raw_status = badge_val
            elif status_val and status_val not in ("—", "-"):
                raw_status = status_val
            elif badge_val:
                raw_status = badge_val
            else:
                raw_status = "Active"

            st_clean = raw_status.lower()
            statuses_found.add(raw_status)
            status_counts[raw_status] = status_counts.get(raw_status, 0) + 1

            is_hp = (
                "high" in st_clean
                or "hp" in st_clean
                or "hot" in st_clean
                or "top" in st_clean
                or "priority" in st_clean
            )
            is_p = not is_hp and (
                "potential" in st_clean
                or "positive" in st_clean
                or "pos" in st_clean
                or "warm" in st_clean
                or "interested" in st_clean
                or st_clean in ("p", "pot")
            )
            is_fup = not is_hp and not is_p and (
                "follow" in st_clean
                or "fup" in st_clean
                or "fub" in st_clean
                or "call" in st_clean
                or "next" in st_clean
                or "scheduled" in st_clean
            )

            if is_hp:
                total_hp += 1
            elif is_p:
                total_p += 1
            elif is_fup:
                total_fup += 1
            else:
                total_other += 1

            is_unassigned = (
                not assigned
                or assigned in ("—", "-", "Unassigned", "None", "null", "undefined")
                or assigned.lower() in ("unassigned", "not assigned", "none")
            )

            if is_unassigned:
                unassigned_leads.append({
                    "id": lead.get("id"),
                    "name": lead.get("name"),
                    "phone": lead.get("phone"),
                    "project": lead.get("project"),
                    "status": raw_status,
                    "created_at": lead.get("created_at"),
                    "crm_link": lead.get("crm_link"),
                })
                continue

            source_val = (lead.get("source") or "").strip()
            if not source_val or source_val in ("—", "-", "null", "None", ""):
                source_val = "Direct / Other"
            sources_found.add(source_val)
            source_counts[source_val] = source_counts.get(source_val, 0) + 1

            if assigned not in exec_map:
                exec_map[assigned] = {
                    "name": assigned,
                    "total_leads": 0,
                    "hp_count": 0,
                    "p_count": 0,
                    "fup_count": 0,
                    "other_count": 0,
                    "status_breakdown": {},
                    "source_breakdown": {},
                    "projects": set(),
                    "lead_samples": [],
                }

            exec_map[assigned]["total_leads"] += 1
            exec_map[assigned]["status_breakdown"][raw_status] = (
                exec_map[assigned]["status_breakdown"].get(raw_status, 0) + 1
            )
            exec_map[assigned]["source_breakdown"][source_val] = (
                exec_map[assigned]["source_breakdown"].get(source_val, 0) + 1
            )
            if is_hp:
                exec_map[assigned]["hp_count"] += 1
            elif is_p:
                exec_map[assigned]["p_count"] += 1
            elif is_fup:
                exec_map[assigned]["fup_count"] += 1
            else:
                exec_map[assigned]["other_count"] += 1

            proj = lead.get("project")
            if proj and proj not in ("—", "-"):
                exec_map[assigned]["projects"].add(proj)

            if len(exec_map[assigned]["lead_samples"]) < 5:
                raw_obj = lead.get("raw")
                raw_keys = list(raw_obj.keys()) if isinstance(raw_obj, dict) else (f"array_{len(raw_obj)}" if isinstance(raw_obj, (list, tuple)) else str(type(raw_obj)))
                exec_map[assigned]["lead_samples"].append({
                    "id": lead.get("id"),
                    "name": lead.get("name"),
                    "phone": lead.get("phone"),
                    "project": proj,
                    "status": raw_status,
                    "source": source_val,
                    "badge": lead.get("badge"),
                    "lead_cat_id": lead.get("lead_cat_id"),
                    "created_at": lead.get("created_at"),
                    "raw_keys": raw_keys,
                })

        executives = []
        for name, data in exec_map.items():
            executives.append({
                "name": name,
                "total_leads": data["total_leads"],
                "hp_count": data["hp_count"],
                "p_count": data["p_count"],
                "fup_count": data["fup_count"],
                "other_count": data["other_count"],
                "status_breakdown": data["status_breakdown"],
                "source_breakdown": data.get("source_breakdown", {}),
                "projects": sorted(list(data["projects"]))[:6],
                "lead_samples": data["lead_samples"],
            })

        executives.sort(key=lambda x: (x["total_leads"], x["hp_count"]), reverse=True)

        summary_result = {
            "success": True,
            "total_crm_leads": records_total,
            "analyzed_count": len(leads),
            "total_hp": total_hp,
            "total_p": total_p,
            "total_fup": total_fup,
            "total_other": total_other,
            "status_counts": status_counts,
            "source_counts": source_counts,
            "sources_found": sorted(list(sources_found)),
            "unassigned_count": len(unassigned_leads),
            "unassigned_leads": unassigned_leads[:50],
            "executives": executives,
            "statuses_found": sorted(list(statuses_found)),
            "fetched_at": res.get("fetched_at"),
            "from_cache": res.get("from_cache", False),
            "is_full_sync": bool(cached and cached.get("is_full_sync")),
        }
        if not cached:
            self._save_pipeline_cache(summary_result)
        return summary_result

    async def start_full_sync(self, batch_size: int = 1000) -> Dict[str, Any]:
        """Start full CRM lead aggregation in the background across all 50k+ leads."""
        if CrmService._sync_state.get("running"):
            return {
                "started": False,
                "message": "Full sync is already running.",
                "status": CrmService._sync_state,
            }

        CrmService._sync_cancel_requested = False
        target_total = CrmService._cached_records_total or 53442
        CrmService._sync_state = {
            "running": True,
            "current": 0,
            "total": target_total,
            "percent": 0,
            "status": "Connecting to Somikoron CRM...",
            "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "completed_at": None,
            "error": None,
        }

        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = asyncio.get_event_loop()

        CrmService._sync_task = loop.create_task(self._run_full_sync_loop(batch_size=batch_size))
        return {
            "started": True,
            "message": "Full CRM lead sync started.",
            "status": CrmService._sync_state,
        }

    def get_sync_status(self) -> Dict[str, Any]:
        """Return current status and progress of the background full sync."""
        st = dict(CrmService._sync_state)
        cached = self._load_pipeline_cache()
        if cached:
            st["last_synced_at"] = cached.get("synced_at") or cached.get("fetched_at")
            st["has_cache"] = True
            st["cached_total"] = cached.get("analyzed_count")
            st["is_full_sync"] = cached.get("is_full_sync", False)
        else:
            st["has_cache"] = False
        return st

    def cancel_sync(self) -> Dict[str, Any]:
        """Cancel ongoing sync."""
        if CrmService._sync_state.get("running"):
            CrmService._sync_cancel_requested = True
            CrmService._sync_state["status"] = "Cancelling sync..."
            return {"cancelled": True, "message": "Cancellation requested."}
        return {"cancelled": False, "message": "No sync is currently running."}

    async def _run_full_sync_loop(self, batch_size: int = 1000) -> None:
        """Background worker that streams and aggregates all leads in batches of 1,000."""
        try:
            # 1. Probe first batch to detect exact total leads in CRM
            probe_res = await self.fetch_leads(
                force_refresh=True,
                length=batch_size,
                start=0,
                from_date="1971-01-01",
                active_status="Active",
            )
            if not probe_res.get("success", False):
                raise RuntimeError(probe_res.get("error", "Failed to connect to Somikoron CRM"))

            total_records = probe_res.get("records_total") or probe_res.get("records_filtered") or 53442
            CrmService._sync_state["total"] = total_records

            exec_map: Dict[str, Dict[str, Any]] = {}
            unassigned_leads: List[Dict[str, Any]] = []
            statuses_found: set[str] = set()
            status_counts: Dict[str, int] = {}
            sources_found: set[str] = set()
            source_counts: Dict[str, int] = {}
            total_hp = 0
            total_p = 0
            total_fup = 0
            total_other = 0
            fetched_count = 0
            start = 0

            while start < total_records:
                if CrmService._sync_cancel_requested:
                    logger.info("CRM full sync cancelled by user request at %d leads.", fetched_count)
                    break

                if start == 0:
                    b_res = probe_res
                else:
                    b_res = await self.fetch_leads(
                        force_refresh=False,
                        length=batch_size,
                        start=start,
                        from_date="1971-01-01",
                        active_status="Active",
                    )
                    if not b_res.get("success", False):
                        await asyncio.sleep(1.5)
                        b_res = await self.fetch_leads(
                            force_refresh=True,
                            length=batch_size,
                            start=start,
                            from_date="1971-01-01",
                            active_status="Active",
                        )
                        if not b_res.get("success", False):
                            logger.error("CRM batch failed at start=%d: %s", start, b_res.get("error"))
                            break

                leads = b_res.get("leads", [])
                if not leads:
                    break

                for lead in leads:
                    assigned = (lead.get("assigned_to") or "").strip()
                    status_val = (lead.get("status") or "").strip()
                    badge_val = (lead.get("badge") or "").strip()
                    cat_val = (lead.get("lead_category") or "").strip()

                    if cat_val and cat_val not in ("—", "-"):
                        raw_status = cat_val
                    elif status_val and status_val.lower() not in ("active", "—", "-"):
                        raw_status = status_val
                    elif badge_val and badge_val.lower() not in ("active", "—", "-"):
                        raw_status = badge_val
                    elif status_val and status_val not in ("—", "-"):
                        raw_status = status_val
                    elif badge_val:
                        raw_status = badge_val
                    else:
                        raw_status = "Active"

                    st_clean = raw_status.lower()
                    statuses_found.add(raw_status)
                    status_counts[raw_status] = status_counts.get(raw_status, 0) + 1

                    is_hp = any(x in st_clean for x in ("high", "hp", "hot", "top", "priority"))
                    is_p = not is_hp and (any(x in st_clean for x in ("potential", "positive", "pos", "warm", "interested")) or st_clean in ("p", "pot"))
                    is_fup = not is_hp and not is_p and any(x in st_clean for x in ("follow", "fup", "fub", "call", "next", "scheduled"))

                    if is_hp:
                        total_hp += 1
                    elif is_p:
                        total_p += 1
                    elif is_fup:
                        total_fup += 1
                    else:
                        total_other += 1

                    is_unassigned = (
                        not assigned
                        or assigned in ("—", "-", "Unassigned", "None", "null")
                        or assigned.lower() in ("unassigned", "not assigned", "none")
                    )

                    if is_unassigned:
                        if len(unassigned_leads) < 100:
                            unassigned_leads.append({
                                "id": lead.get("id"),
                                "name": lead.get("name"),
                                "phone": lead.get("phone"),
                                "project": lead.get("project"),
                                "status": raw_status,
                                "created_at": lead.get("created_at"),
                                "crm_link": lead.get("crm_link"),
                            })
                        continue

                    source_val = (lead.get("source") or "").strip()
                    if not source_val or source_val in ("—", "-", "null", "None", ""):
                        source_val = "Direct / Other"
                    sources_found.add(source_val)
                    source_counts[source_val] = source_counts.get(source_val, 0) + 1

                    if assigned not in exec_map:
                        exec_map[assigned] = {
                            "name": assigned,
                            "total_leads": 0,
                            "hp_count": 0,
                            "p_count": 0,
                            "fup_count": 0,
                            "other_count": 0,
                            "status_breakdown": {},
                            "source_breakdown": {},
                            "projects": set(),
                            "lead_samples": [],
                        }

                    exec_map[assigned]["total_leads"] += 1
                    exec_map[assigned]["status_breakdown"][raw_status] = (
                        exec_map[assigned]["status_breakdown"].get(raw_status, 0) + 1
                    )
                    exec_map[assigned]["source_breakdown"][source_val] = (
                        exec_map[assigned]["source_breakdown"].get(source_val, 0) + 1
                    )
                    if is_hp:
                        exec_map[assigned]["hp_count"] += 1
                    elif is_p:
                        exec_map[assigned]["p_count"] += 1
                    elif is_fup:
                        exec_map[assigned]["fup_count"] += 1
                    else:
                        exec_map[assigned]["other_count"] += 1

                    proj = lead.get("project")
                    if proj and proj not in ("—", "-"):
                        exec_map[assigned]["projects"].add(proj)

                    if len(exec_map[assigned]["lead_samples"]) < 5:
                        exec_map[assigned]["lead_samples"].append({
                            "id": lead.get("id"),
                            "name": lead.get("name"),
                            "phone": lead.get("phone"),
                            "project": proj,
                            "status": raw_status,
                            "source": source_val,
                            "badge": lead.get("badge"),
                            "lead_cat_id": lead.get("lead_cat_id"),
                            "created_at": lead.get("created_at"),
                        })

                fetched_count += len(leads)
                start += len(leads)
                pct = min(100, round((fetched_count / max(total_records, 1)) * 100))
                CrmService._sync_state["current"] = fetched_count
                CrmService._sync_state["percent"] = pct
                CrmService._sync_state["status"] = f"Processed {fetched_count:,} of {total_records:,} leads ({pct}%)..."

                # Brief non-blocking sleep to keep Somikoron CRM server healthy
                await asyncio.sleep(0.04)

            executives = []
            for name, data in exec_map.items():
                executives.append({
                    "name": name,
                    "total_leads": data["total_leads"],
                    "hp_count": data["hp_count"],
                    "p_count": data["p_count"],
                    "fup_count": data["fup_count"],
                    "other_count": data["other_count"],
                    "status_breakdown": data["status_breakdown"],
                    "source_breakdown": data.get("source_breakdown", {}),
                    "projects": sorted(list(data["projects"]))[:6],
                    "lead_samples": data["lead_samples"],
                })

            executives.sort(key=lambda x: (x["total_leads"], x["hp_count"]), reverse=True)

            summary_payload = {
                "success": True,
                "total_crm_leads": total_records,
                "analyzed_count": fetched_count,
                "total_hp": total_hp,
                "total_p": total_p,
                "total_fup": total_fup,
                "total_other": total_other,
                "status_counts": status_counts,
                "source_counts": source_counts,
                "sources_found": sorted(list(sources_found)),
                "unassigned_count": len(unassigned_leads),
                "unassigned_leads": unassigned_leads,
                "executives": executives,
                "statuses_found": sorted(list(statuses_found)),
                "synced_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "is_full_sync": True,
                "from_cache": True,
            }

            self._save_pipeline_cache(summary_payload)

            was_cancelled = CrmService._sync_cancel_requested
            CrmService._sync_state = {
                "running": False,
                "success": not was_cancelled,
                "current": fetched_count,
                "total": total_records,
                "percent": 100 if not was_cancelled else pct,
                "status": f"Completed! All {fetched_count:,} leads aggregated across {len(executives)} executives." if not was_cancelled else f"Stopped at {fetched_count:,} leads.",
                "completed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "error": None,
            }
        except Exception as e:
            logger.error("CRM full sync failed: %s", str(e), exc_info=True)
            CrmService._sync_state = {
                "running": False,
                "success": False,
                "current": CrmService._sync_state.get("current", 0),
                "total": CrmService._sync_state.get("total", 0),
                "percent": CrmService._sync_state.get("percent", 0),
                "status": f"Error: {str(e)}",
                "completed_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "error": str(e),
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

        # Comprehensive HTML parsing across ALL fields in raw
        embedded: Dict[str, str] = {}
        crm_link = None
        badge = None
        badges: List[str] = []

        for v in raw.values():
            if isinstance(v, str) and ("<" in v and ">" in v):
                # Extract CRM details URL if present
                if not crm_link:
                    href_m = re.search(r'href=["\']([^"\']+)["\']', v, re.I)
                    if href_m and ("lead" in href_m.group(1).lower() or "detail" in href_m.group(1).lower()):
                        crm_link = href_m.group(1).strip()

                # Extract badges / labels (<span class="badge ..."> or <label class="..."> or any <span>)
                span_matches = re.findall(r'<(?:span|label|strong|b)[^>]*>(.*?)</(?:span|label|strong|b)>', v, re.I | re.S)
                for sm in span_matches:
                    clean_b = strip_html(sm)
                    if clean_b and clean_b not in ("—", "-", "...", "") and len(clean_b) < 60:
                        badges.append(clean_b)

                # Extract key: value pairs from divs, paragraphs, table cells, or bold tags
                field_matches = re.findall(r'<(?:div|p|li|td)[^>]*>(.*?)</(?:div|p|li|td)>', v, re.I | re.S)
                for fm in field_matches:
                    clean_fm = strip_html(fm)
                    if ":" in clean_fm:
                        k, val = clean_fm.split(":", 1)
                        clean_k = k.strip().lower()
                        clean_v = val.strip()
                        if clean_k and clean_v and clean_k not in embedded:
                            embedded[clean_k] = clean_v

        # Select primary badge (favor badges that look like sales categories)
        for b in badges:
            b_lower = b.lower()
            if any(term in b_lower for term in ("hp", "potential", "follow", "fup", "hot", "warm", "cold", "booking", "sold", "lost", "interested", "active")):
                badge = b
                break
        if not badge and badges:
            badge = badges[0]

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
        raw_source = pick("source_name", "source", "lead_source", "media", "campaign", "channel", "source_title")
        clean_source = strip_html(raw_source) if raw_source else ""
        if not clean_source or clean_source in ("—", "-"):
            clean_source = embedded.get("source", "—")

        # Resolve Status / Pipeline Category
        lead_cat_id = pick("lead_cat_id", "category_id", "cat_id", "lead_category_id")

        emb_status = (
            embedded.get("category")
            or embedded.get("lead category")
            or embedded.get("lead_category")
            or embedded.get("lead_cat")
            or embedded.get("stage")
            or embedded.get("lead stage")
            or embedded.get("priority")
            or embedded.get("status")
            or embedded.get("lead status")
        )

        stage_candidate = (
            pick(
                "lead_category",
                "category_name",
                "cat_name",
                "lead_cat_name",
                "category",
                "lead_stage",
                "stage_name",
                "stage",
                "pipeline_stage",
                "sub_category",
                "priority",
                "priority_name",
                "lead_type",
            )
            or emb_status
            or (badge if badge and badge.lower() not in ("active", "new assignment", "inactive") else None)
        )

        general_status = pick("lead_status", "status", "state", "lead_state") or badge

        if stage_candidate and stage_candidate.strip():
            clean_status = strip_html(stage_candidate)
        elif general_status and general_status.strip():
            clean_status = strip_html(general_status)
        else:
            clean_status = "Active"

        if not clean_status or clean_status in ("—", "-", "null", "None"):
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
            "lead_cat_id": lead_cat_id,
            "stage": clean_status,
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
