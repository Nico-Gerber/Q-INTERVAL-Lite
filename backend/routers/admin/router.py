"""Admin user-management endpoints for the signup approval workflow.

Every route verifies the caller's Supabase JWT and confirms the caller is an
approved admin *server-side*. Writes use the service-role key, which only ever
lives in backend/.env (never in the React app).
"""
from datetime import datetime, timezone
from uuid import UUID
from typing import List, Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY as SERVICE_KEY
from guards import require_admin

ASSIGNABLE_ROLES = ("clinician", "patient")  # admins are never created via the API
Role = Literal["clinician", "patient"]

router = APIRouter(prefix="/admin", tags=["admin"])


class RoleBody(BaseModel):
    role: Role


class AssignBody(BaseModel):
    patient_ids: List[UUID] = Field(min_length=1, max_length=100)


def _service_headers() -> dict:
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }


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


BUCKET = "session-images"


async def _delete_user_data(client: httpx.AsyncClient, user_id: str):
    """Delete a user's own session data (and stored images) before their account goes.

    Patients: every session where they are the patient.
    Clinicians/admins: their scratch sessions (no patient). Sessions linked to patients are kept for
    the patient's history; they are just detached from the deleted clinician.
    """
    res = await client.get(
        f"{SUPABASE_URL}/rest/v1/sessions",
        params={"select": "id", "or": f"(patient_id.eq.{user_id},and(clinician_id.eq.{user_id},patient_id.is.null))"},
        headers=_service_headers(),
    )
    if res.status_code != 200:
        raise HTTPException(502, "Could not look up the user's sessions.")
    session_ids = [r["id"] for r in res.json()]

    for i in range(0, len(session_ids), 50):
        batch = session_ids[i:i + 50]
        in_list = f"in.({','.join(batch)})"
        imgs = await client.get(
            f"{SUPABASE_URL}/rest/v1/session_images",
            params={"select": "storage_path", "session_id": in_list},
            headers=_service_headers(),
        )
        paths = [r["storage_path"] for r in imgs.json()] if imgs.status_code == 200 else []
        for j in range(0, len(paths), 100):
            rm = await client.request(
                "DELETE", f"{SUPABASE_URL}/storage/v1/object/{BUCKET}",
                json={"prefixes": paths[j:j + 100]}, headers=_service_headers(),
            )
            if rm.status_code >= 400:
                raise HTTPException(500, "Could not delete the user's stored images.")
        d = await client.delete(f"{SUPABASE_URL}/rest/v1/sessions", params={"id": in_list}, headers=_service_headers())
        if d.status_code >= 400:
            raise HTTPException(500, "Could not delete the user's sessions.")

    # Detach remaining sessions from a deleted clinician so the account delete isn't blocked by a foreign key.
    await client.patch(
        f"{SUPABASE_URL}/rest/v1/sessions",
        params={"clinician_id": f"eq.{user_id}"},
        json={"clinician_id": None},
        headers=_service_headers(),
    )


@router.delete("/users/{user_id}")
async def delete_user(user_id: UUID, admin_id: str = Depends(require_admin)):
    user_id = str(user_id)
    if user_id == admin_id:
        raise HTTPException(400, "You cannot delete your own account.")
    async with httpx.AsyncClient(timeout=60) as client:
        target = await _get_profile(client, user_id)
        if target["role"] == "admin":
            raise HTTPException(400, "Admin accounts cannot be deleted here.")
        await _delete_user_data(client, user_id)
        # Deleting the auth user cascades to public.profiles (on delete cascade).
        res = await client.delete(f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}", headers=_service_headers())
        if res.status_code >= 400:
            raise HTTPException(500, "Could not delete the user.")
    return {"deleted": user_id}


@router.get("/assignments")
async def list_assignments(admin_id: str = Depends(require_admin)):
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/clinician_patients",
            params={"select": "clinician_id,patient_id,assigned_at"},
            headers=_service_headers(),
        )
    if res.status_code != 200:
        raise HTTPException(502, "Could not load assignments.")
    return {"assignments": res.json()}


@router.post("/clinicians/{clinician_id}/patients")
async def assign_patients(clinician_id: UUID, body: AssignBody, admin_id: str = Depends(require_admin)):
    clinician_id = str(clinician_id)
    patient_ids = sorted({str(p) for p in body.patient_ids})
    async with httpx.AsyncClient(timeout=15) as client:
        clinician = await _get_profile(client, clinician_id)
        if clinician["role"] != "clinician" or clinician["status"] != "approved":
            raise HTTPException(400, "The selected user is not an approved clinician.")

        res = await client.get(
            f"{SUPABASE_URL}/rest/v1/profiles",
            params={"id": f"in.({','.join(patient_ids)})", "select": "id,role,status"},
            headers=_service_headers(),
        )
        found = res.json() if res.status_code == 200 else []
        valid = {p["id"] for p in found if p["role"] == "patient" and p["status"] == "approved"}
        if valid != set(patient_ids):
            raise HTTPException(400, "Every selected user must be an approved patient.")

        res = await client.post(
            f"{SUPABASE_URL}/rest/v1/clinician_patients",
            json=[{"clinician_id": clinician_id, "patient_id": pid, "assigned_by": admin_id} for pid in patient_ids],
            headers={**_service_headers(), "Prefer": "resolution=ignore-duplicates,return=minimal"},
        )
        if res.status_code >= 400:
            raise HTTPException(500, "Could not assign patients.")
    return {"assigned": patient_ids}


@router.delete("/clinicians/{clinician_id}/patients/{patient_id}")
async def unassign_patient(clinician_id: UUID, patient_id: UUID, admin_id: str = Depends(require_admin)):
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.delete(
            f"{SUPABASE_URL}/rest/v1/clinician_patients",
            params={"clinician_id": f"eq.{clinician_id}", "patient_id": f"eq.{patient_id}"},
            headers=_service_headers(),
        )
    if res.status_code >= 400:
        raise HTTPException(500, "Could not remove the assignment.")
    return {"removed": True}
