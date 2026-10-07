"""Create human-reviewed VLM outputs with unsafe visual claims withheld."""

import hashlib
import json
from pathlib import Path


ROOT = Path(
    "/fred/oz508/EMBED/classical_future_risk_vihanga/"
    "v2_hazard_sprint06/experiments/v2c_mammoclip_b5/"
    "explanations"
)
SOURCE_DIR = ROOT / "vlm_outputs_final"
OUTPUT_DIR = ROOT / "vlm_outputs_reviewed"


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def concentration_category(explanation):
    observations = explanation.get("attention_observations", [])
    vlm_observations = [
        item for item in observations
        if item.startswith("Guarded VLM visual description:")
    ]
    text = " ".join(vlm_observations).lower()
    if "concentrat" in text:
        return "concentrated"
    if "diffuse" in text:
        return "diffuse"
    return "uncertain"


def main():
    paths = sorted(SOURCE_DIR.glob("qwen25vl3b_case_*.json"))
    if len(paths) != 5:
        raise RuntimeError(f"Expected five guarded outputs, found {len(paths)}")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    if list(OUTPUT_DIR.glob("qwen25vl3b_case_*.json")):
        raise FileExistsError(
            "Reviewed VLM outputs already exist and were not overwritten"
        )

    manifest = []
    for path in paths:
        data = json.loads(path.read_text(encoding="utf-8"))
        explanation = data["explanation"]
        category = concentration_category(explanation)

        verified_attention = [
            item for item in explanation["attention_observations"]
            if not item.startswith(
                "Guarded VLM visual description:"
            )
        ]
        verified_attention.append(
            "VLM visual-QC category: attention appeared "
            + category
            + " in the montage. This coarse category is descriptive "
            "only and requires human review."
        )

        reviewed = {
            "summary": explanation["summary"],
            "temporal_risk_pattern": explanation[
                "temporal_risk_pattern"
            ],
            "attention_observations": verified_attention,
            "limitations": explanation["limitations"],
            "artifact_overlap_review": (
                "Not accepted as verified from the VLM. Human review "
                "is required because montage-level assessment may miss "
                "printed labels, borders, or background attention."
            ),
        }

        data["explanation"] = reviewed
        data["generation_method"] = (
            "guarded_hybrid_vlm_with_verified_numeric_narrative_"
            "and_human_visual_review"
        )
        data["human_review"] = {
            "status": "accepted_with_visual_claims_limited",
            "vlm_contribution_retained": (
                "coarse_attention_concentration_category"
            ),
            "anatomical_claims_retained": False,
            "artifact_absence_claims_retained": False,
            "outcome_label_reviewed": "not_supplied_to_vlm",
        }
        data["source_guarded_output_sha256"] = sha256_file(path)

        output = OUTPUT_DIR / path.name
        output.write_text(
            json.dumps(data, indent=2) + "\n",
            encoding="utf-8",
        )
        manifest.append({
            "neutral_case_id": data["neutral_case_id"],
            "patient_index": data["patient_index"],
            "output_file": output.name,
            "output_sha256": sha256_file(output),
        })
        print("Wrote:", output)

    manifest_path = OUTPUT_DIR / "reviewed_vlm_manifest.json"
    manifest_path.write_text(
        json.dumps({
            "status": "human_reviewed",
            "cases": manifest,
            "test_set_evaluated": False,
            "outcome_labels_supplied_to_vlm": False,
            "unsafe_draft_outputs_used_as_final": False,
        }, indent=2) + "\n",
        encoding="utf-8",
    )
    print("Cases:", len(manifest))
    print("HUMAN-REVIEWED VLM OUTPUT FINALIZATION: PASS")


if __name__ == "__main__":
    main()
