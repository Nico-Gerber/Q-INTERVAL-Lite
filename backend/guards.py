"""Shared FastAPI dependencies: caller authentication and the analysis concurrency limit."""
import asyncio
import hashlib
import logging
import time
from typing import Optional

import httpx
from fastapi import Header, HTTPException

import config

logger = logging.getLogger(__name__)

_semaphore = asyncio.Semaphore(config.MAX_CONCURRENT_ANALYSES)
_CACHE_TTL_SECONDS = 30
_cache: dict[str, tuple[float, dict]] = {}   # token hash -> (expiry, {"id","role","status"})


def _service_headers() -> dict:
    return {"apikey": config.SUPABASE_SERVICE_ROLE_KEY, "Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}"}


async def _load_caller(authorization: Optional[str]) -> dict:
    """Validate the Supabase JWT with Supabase Auth, then read the caller's role/status from the DB."""
    if not config.SUPABASE_URL or not config.SUPABASE_SERVICE_ROLE_KEY:
        raise HTTPException(503, "Authentication is not configured.")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token.")
    token = authorization[7:].strip()

    key = hashlib.sha256(token.encode()).hexdigest()
    hit = _cache.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]

    async with httpx.AsyncClient(timeout=10) as client:
        auth_res = await client.get(
            f"{config.SUPABASE_URL}/auth/v1/user",
            headers={"apikey": config.SUPABASE_SERVICE_ROLE_KEY, "Authorization": f"Bearer {token}"},
        )
        if auth_res.status_code in (400, 401, 403):
            raise HTTPException(401, "Invalid or expired session.")
        if auth_res.status_code != 200:   # Supabase hiccup (429/5xx): not the user's fault
            logger.warning("Token check failed with HTTP %s", auth_res.status_code)
            raise HTTPException(503, "Could not verify your session right now. Please try again.")
        user_id = auth_res.json().get("id")
        prof_res = await client.get(
            f"{config.SUPABASE_URL}/rest/v1/profiles",
            params={"id": f"eq.{user_id}", "select": "role,status"},
            headers=_service_headers(),
        )
    # A failed lookup is a service problem, not "unapproved": never turn it into a 403 or cache it.
    if prof_res.status_code != 200:
        logger.warning("Profile lookup failed with HTTP %s", prof_res.status_code)
        raise HTTPException(503, "Could not verify your account right now. Please try again.")
    rows = prof_res.json()
    caller = {"id": user_id, "role": rows[0]["role"] if rows else None, "status": rows[0]["status"] if rows else None}

    if len(_cache) > 1000:
        _cache.clear()
    _cache[key] = (time.monotonic() + _CACHE_TTL_SECONDS, caller)
    return caller


async def require_approved_user(authorization: Optional[str] = Header(default=None)) -> Optional[str]:
    """Any approved account (patient, clinician or admin). Returns the caller's user id."""
    if not config.REQUIRE_AUTH:
        return None
    caller = await _load_caller(authorization)
    if caller["status"] != "approved" or caller["role"] not in ("patient", "clinician", "admin"):
        raise HTTPException(403, "Your account is not approved.")
    return caller["id"]


async def require_admin(authorization: Optional[str] = Header(default=None)) -> str:
    """Approved admin only. Returns the caller's user id."""
    caller = await _load_caller(authorization)
    if caller["role"] != "admin" or caller["status"] != "approved":
        raise HTTPException(403, "Administrator access required.")
    return caller["id"]


async def limit_analysis():
    """Run heavy model inference one at a time (configurable) so concurrent requests queue instead of exhausting memory."""
    async with _semaphore:
        yield
