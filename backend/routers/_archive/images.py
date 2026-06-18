import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from PIL import Image

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

ALLOWED_TYPES = {"image/jpeg", "image/png", "application/dicom"}
DICOM_TYPES  = {"application/dicom"}
MAX_SIZE_MB  = 10

router = APIRouter(prefix="/images", tags=["images"])


@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{file.content_type}'. Allowed: {ALLOWED_TYPES}",
        )

    contents = await file.read()

    if len(contents) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {MAX_SIZE_MB} MB limit.",
        )

    if file.content_type not in DICOM_TYPES:
        try:
            from io import BytesIO
            Image.open(BytesIO(contents)).verify()
        except Exception:
            raise HTTPException(status_code=422, detail="File is not a valid image.")
    else:
       
        if len(contents) < 132 or contents[128:132] != b"DICM":
            raise HTTPException(status_code=422, detail="File does not appear to be a valid DICOM file.")

    ext = Path(file.filename).suffix or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    #dest = UPLOAD_DIR / filename

    #async with aiofiles.open(dest, "wb") as f:
    #   await f.write(contents)

    return JSONResponse(
        status_code=201,
        content={
            "message": "Upload successful",
            "filename": filename,
            "original_name": file.filename,
            "size_bytes": len(contents),
            "content_type": file.content_type,
        },
    )


@router.get("/")
async def list_images():
    files = [
        {"filename": p.name, "size_bytes": p.stat().st_size}
        for p in sorted(UPLOAD_DIR.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True)
        if p.is_file()
    ]
    return {"images": files}
