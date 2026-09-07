

import json
from datetime import datetime
from typing import List

from fastapi import HTTPException, UploadFile

from .schema import VIEW_KEYS, FutureRiskInput


async def parse_future_risk_request(
    metadata_json: str,
    files: List[UploadFile],
) -> FutureRiskInput:
    try:
        metadata = json.loads(metadata_json)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"metadata_json is not valid JSON: {exc}",
        ) from exc

    if not isinstance(metadata, dict):
        raise HTTPException(status_code=400, detail="metadata_json must be an object.")

    raw_age = metadata.get("patient_age")
    if raw_age in (None, ""):
        patient_age = None
    else:
        try:
            patient_age = float(raw_age)
        except (TypeError, ValueError) as exc:
            raise HTTPException(
                status_code=400,
                detail="patient_age must be numeric.",
            ) from exc

    raw_exams = metadata.get("exams")
    if not isinstance(raw_exams, list) or not raw_exams:
        raise HTTPException(
            status_code=400,
            detail="metadata_json.exams must contain at least one exam.",
        )

    file_bytes = {}
    for upload in files:
        if not upload.filename:
            continue
        file_bytes[upload.filename] = await upload.read()

    exams = []
    seen_ids = set()
    seen_dates = set()

    for index, exam in enumerate(raw_exams, start=1):
        if not isinstance(exam, dict):
            raise HTTPException(
                status_code=400,
                detail=f"Exam {index} must be an object.",
            )

        exam_id = str(exam.get("exam_id") or f"exam_{index}")
        if exam_id in seen_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate exam_id: {exam_id}",
            )
        seen_ids.add(exam_id)

        exam_date = exam.get("exam_date")
        if not isinstance(exam_date, str):
            raise HTTPException(
                status_code=400,
                detail=f"{exam_id} has no valid exam_date.",
            )
        try:
            datetime.strptime(exam_date, "%Y-%m-%d")
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail=f"{exam_id} exam_date must be YYYY-MM-DD.",
            ) from exc

        if exam_date in seen_dates:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate exam_date: {exam_date}",
            )
        seen_dates.add(exam_date)

        raw_views = exam.get("views")
        if not isinstance(raw_views, dict):
            raise HTTPException(
                status_code=400,
                detail=f"{exam_id}.views must be an object.",
            )

        unknown = sorted(set(raw_views) - set(VIEW_KEYS))
        if unknown:
            raise HTTPException(
                status_code=400,
                detail=f"{exam_id} contains unsupported views: {unknown}",
            )

        views = {key: None for key in VIEW_KEYS}
        for view_key, filename in raw_views.items():
            if filename in (None, ""):
                continue
            if not isinstance(filename, str):
                raise HTTPException(
                    status_code=400,
                    detail=f"{exam_id} {view_key} filename must be text.",
                )
            if filename not in file_bytes:
                raise HTTPException(
                    status_code=400,
                    detail=f"Missing uploaded file for {exam_id} {view_key}: {filename}",
                )
            views[view_key] = file_bytes[filename]

        if not any(value is not None for value in views.values()):
            raise HTTPException(
                status_code=400,
                detail=f"{exam_id} must contain at least one uploaded image.",
            )

        exams.append(
            {
                "exam_id": exam_id,
                "exam_date": exam_date,
                "views": views,
            }
        )

    exams.sort(key=lambda item: item["exam_date"])

    return {
        "patient_age": patient_age,
        "exams": exams,
    }
