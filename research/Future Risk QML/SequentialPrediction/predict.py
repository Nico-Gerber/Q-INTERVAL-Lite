"""
Run the QeSFRP view-aware sequential QML future-risk model locally.

This script delegates to QeSFRP-Backend.py so CLI predictions and website
predictions use the same model artifact and inference pipeline.

Example:
    python predict.py --metadata metadata.json --images exam1_L-CC.png exam1_R-CC.png exam1_L-MLO.png exam1_R-MLO.png

If metadata_json uses filenames that differ from local paths, pass aliases:
    python predict.py --metadata metadata.json --images L-CC.png=path/to/local_left_cc.png
"""

import argparse
import asyncio
import importlib.util
import json
from pathlib import Path
from typing import List


SCRIPT_DIR = Path(__file__).resolve().parent
# The QeSFRP backend now lives inside the FastAPI app's quantum_future_risk route
# folder so the website and this CLI share one model artifact + inference pipeline.
REPO_ROOT = SCRIPT_DIR.parents[2]
BACKEND_PATH = REPO_ROOT / "backend" / "routers" / "quantum_future_risk" / "qesfrp_backend.py"
DEFAULT_OUTPUT_PATH = SCRIPT_DIR / "qesfrp_predictions.json"


class LocalUploadFile:
    def __init__(self, filename: str, content: bytes):
        self.filename = filename
        self.content = content
        self.content_type = "image/*"

    async def read(self) -> bytes:
        return self.content


def load_backend_module():
    if not BACKEND_PATH.exists():
        raise FileNotFoundError(f"Missing backend script: {BACKEND_PATH}")

    spec = importlib.util.spec_from_file_location("qesfrp_backend", BACKEND_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not import backend script: {BACKEND_PATH}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def read_metadata_json(path: Path) -> str:
    if not path.exists():
        raise FileNotFoundError(f"Metadata file not found: {path}")
    return path.read_text(encoding="utf-8")


def parse_image_arg(value: str) -> tuple[str, Path]:
    if "=" in value:
        filename, path = value.split("=", 1)
        return filename, Path(path)

    path = Path(value)
    return path.name, path


def collect_upload_files(image_args: List[str]) -> List[LocalUploadFile]:
    uploads = []

    for image_arg in image_args:
        filename, path = parse_image_arg(image_arg)
        if not path.exists():
            raise FileNotFoundError(f"Image file not found: {path}")
        uploads.append(LocalUploadFile(filename=filename, content=path.read_bytes()))

    if not uploads:
        raise ValueError("At least one image path is required.")

    return uploads


async def run_prediction(metadata_json: str, uploads: List[LocalUploadFile]):
    backend = load_backend_module()
    backend.startup_event()
    return await backend.qml_future_risk_view_aware(
        metadata_json=metadata_json,
        files=uploads,
    )


def main():
    parser = argparse.ArgumentParser(
        description="Run the QeSFRP view-aware sequential QML future-risk model."
    )
    parser.add_argument(
        "--metadata",
        required=True,
        help="Path to metadata JSON. Must include patient_age and exams[].views for L-CC, R-CC, L-MLO, R-MLO.",
    )
    parser.add_argument(
        "--images",
        nargs="+",
        required=True,
        help="Image paths, or metadata_filename=local_path aliases.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_OUTPUT_PATH),
        help="Output JSON path.",
    )

    args = parser.parse_args()

    metadata_json = read_metadata_json(Path(args.metadata))
    uploads = collect_upload_files(args.images)

    print("Running QeSFRP view-aware QML prediction...")
    result = asyncio.run(run_prediction(metadata_json, uploads))

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(result, indent=4), encoding="utf-8")

    print(f"Prediction complete. Saved JSON output to: {output_path}")
    print(json.dumps(result["future_risk"], indent=4))


if __name__ == "__main__":
    main()
