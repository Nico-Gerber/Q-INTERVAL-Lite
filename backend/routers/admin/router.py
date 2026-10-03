"""Admin user-management endpoints for the signup approval workflow.

Every route verifies the caller's Supabase JWT and confirms the caller is an
approved admin *server-side*. Writes use the service-role key, which only ever
lives in backend/.env (never in the React app).
"""
import os
from datetime import datetime, timezone
from uuid import UUID
from typing import Literal, Optional

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel

load_dotenv()

SUPABASE_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
SERVICE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

ASSIGNABLE_ROLES = ("clinician", "patient")  # admins are never created via the API
Role = Literal["clinician", "patient"]

router = APIRouter(prefix="/admin", tags=["admin"])


class RoleBody(BaseModel):
    role: Role


def _service_headers() -> dict:
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def _require_config():
    if not SUPABASE_URL or not SERVICE_KEY:
        raise HTTPException(503, "Admin API is not configured.")


async def require_admin(authorization: Optional[str] = Header(default=None)) -> str:
    """Validate the caller's JWT with Supabase Auth, then check profile role/status in the DB."""
    _require_config()
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token.")
    token = authorization[7:].strip()

    async with httpx.AsyncClient(timeout=10) as client:
        # Supabase Auth validates signature + expiry for us.
        auth_res = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {token}"},
        )
        if auth_res.status_code != 200:
            raise HTTPException(401, "Invalid or expired session.")
        caller_id = auth_res.json().get("id")

        prof_res = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            params={"id": f"eq.{caller_id}", "select": "role,status"},
            headers=_service_headers(),
        )
    rows = prof_res.json() if prof_res.status_code == 200 else []
    if not rows or rows[0]["role"] != "admin" or rows[0]["status"] != "approved":
        raise HTTPException(403, "Administrator access required.")
    return caller_id


async def _get_profile(client: httpx.AsyncClient, user_id: str) -> dict:
    res = await client.get(
        f"{SUPABASE_URL}/rest/v1/profiles",
        params={"id": f"eq.{user_id}", "select": "id,role,status"},
        headers=_service_headers(),
    )
    rows = res.json() if res.status_code == 200 else []
    if not rows:
        raise HTTPException(404, "User not found.")
    return rows[0]


async def _update_profile(client: httpx.AsyncClient, user_id: str, values: dict) -> dict:
    res = await client.patch(
        f"{SUPABASE_URL}/rest/v1/profiles",
        params={"id": f"eq.{user_id}"},
        json=values,
        headers={**_service_headers(), "Prefer": "return=representation"},
    )
    if res.status_code >= 400 or not res.json():
        raise HTTPException(500, "Could not update the user.")
    return res.json()[0]


async def _emails_by_id(client: httpx.AsyncClient) -> dict:
    emails, page, per_page = {}, 1, 1000
    while True:
        res = await client.get(
            f"{SUPABASE_URL}/auth/v1/admin/users",
            params={"page": page, "per_page": per_page},
            headers=_service_headers(),
        )
        if res.status_code != 200:
            raise HTTPException(502, "Could not load user emails.")
        users = res.json().get("users", [])
        emails.update({u["id"]: u.get("email") for u in users})
        if len(users) < per_page:
            return emails
        page += 1


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/users")
async def list_users(
    status: Optional[Literal["pending", "approved", "rejected"]] = Query(default=None),
    admin_id: str = Depends(require_admin),
):
    params = {
        "select": "id,full_name,role,status,access_reason,created_at,reviewed_at",
        "order": "created_at.desc",
    }
    if status:
        params["status"] = f"eq.{status}"
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(f"{SUPABASE_URL}/rest/v1/profiles", params=params, headers=_service_headers())
        if res.status_code != 200:
            raise HTTPException(502, "Could not load users.")
        emails = await _emails_by_id(client)
    return {
        "current_user_id": admin_id,
        "users": [{**p, "email": emails.get(p["id"])} for p in res.json()],
    }


@router.post("/users/{user_id}/approve")
async def approve_user(user_id: UUID, body: RoleBody, admin_id: str = Depends(require_admin)):
    user_id = str(user_id)
    async with httpx.AsyncClient(timeout=15) as client:
        target = await _get_profile(client, user_id)
        if target["role"] == "admin":
            raise HTTPException(400, "Admin accounts cannot be modified here.")
        return await _update_profile(client, user_id, {
            "status": "approved", "role": body.role,
            "reviewed_at": _now(), "reviewed_by": admin_id,
        })


@router.post("/users/{user_id}/reject")
async def reject_user(user_id: UUID, admin_id: str = Depends(require_admin)):
    user_id = str(user_id)
    if user_id == admin_id:
        raise HTTPException(400, "You cannot reject your own account.")
    async with httpx.AsyncClient(timeout=15) as client:
        target = await _get_profile(client, user_id)
        if target["role"] == "admin":
            raise HTTPException(400, "Admin accounts cannot be modified here.")
        return await _update_profile(client, user_id, {
            "status": "rejected", "role": None,
            "reviewed_at": _now(), "reviewed_by": admin_id,
        })


@router.patch("/users/{user_id}/role")
async def change_role(user_id: UUID, body: RoleBody, admin_id: str = Depends(require_admin)):
    user_id = str(user_id)
    if user_id == admin_id:
        raise HTTPException(400, "You cannot change your own role.")
    async with httpx.AsyncClient(timeout=15) as client:
        target = await _get_profile(client, user_id)
        if target["role"] == "admin":
            raise HTTPException(400, "Admin accounts cannot be modified here.")
        if target["status"] != "approved":
            raise HTTPException(400, "Only approved users can have their role changed.")
        return await _update_profile(client, user_id, {
            "role": body.role, "reviewed_at": _now(), "reviewed_by": admin_id,
        })


@router.delete("/users/{user_id}")
async def delete_user(user_id: UUID, admin_id: str = Depends(require_admin)):
    user_id = str(user_id)
    if user_id == admin_id:
        raise HTTPException(400, "You cannot delete your own account.")
    async with httpx.AsyncClient(timeout=15) as client:
        target = await _get_profile(client, user_id)
        if target["role"] == "admin":
            raise HTTPException(400, "Admin accounts cannot be deleted here.")
        # Deleting the auth user cascades to public.profiles (on delete cascade).
        res = await client.delete(f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}", headers=_service_headers())
        if res.status_code >= 400:
            raise HTTPException(500, "Could not delete the user.")
    return {"deleted": user_id}
