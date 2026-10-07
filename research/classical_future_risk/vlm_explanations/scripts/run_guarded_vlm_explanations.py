"""Generate label-blind, grounded explanations for selected V2D cases."""

import hashlib
import json
import re
from pathlib import Path

import torch
from PIL import Image
from qwen_vl_utils import process_vision_info
from transformers import AutoProcessor, Qwen2_5_VLForConditionalGeneration


ROOT = Path(
    "/fred/oz508/EMBED/classical_future_risk_vihanga/"
    "v2_hazard_sprint06/experiments/v2c_mammoclip_b5"
)
MODEL_DIR = Path(
    "/fred/oz508/EMBED/classical_future_risk_vihanga/"
    "models/Qwen2.5-VL-3B-Instruct"
)
INPUT_DIR = ROOT / "explanations/vlm_inputs"
FIGURE_DIR = ROOT / "explanations/figures"
SANITIZED_DIR = ROOT / "explanations/vlm_sanitized_inputs"
OUTPUT_DIR = ROOT / "explanations/vlm_outputs_final"
MODEL_REVISION = "66285546d2b821cf421d4f5eb2576359d3770cd3"


def sha256_file(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def rounded(values):
    return [round(float(value), 6) for value in values]


def build_grounding(data):
    examinations = []
    for exam in data["examinations"]:
        views = []
        for view in exam["views"]:
            if view["available"]:
                views.append({
                    "view": view["view_slot"],
                    "view_attention_weight": round(
                        float(view["view_attention_weight"]), 6
                    ),
                    "strongest_attention_cell": view[
                        "strongest_attention_cell"
                    ],
                })

        examinations.append({
            "examination_number": exam["sequence_position"],
            "years_since_previous_examination": round(
                float(exam["years_since_previous_examination"]), 4
            ),
            "years_before_anchor": round(
                float(exam["years_before_anchor"]), 4
            ),
            "risk_after_this_examination": rounded(
                exam["risk_after_this_examination"]
            ),
            "risk_change_from_previous_examination": (
                None
                if exam["risk_change_from_previous_examination"] is None
                else rounded(
                    exam["risk_change_from_previous_examination"]
                )
            ),
            "available_views": views,
        })

    return {
        "risk_horizons_years": data["risk_horizons_years"],
        "final_predicted_cumulative_risk": rounded(
            data["predicted_cumulative_risk"]
        ),
        "examinations": examinations,
    }


def sanitize_figure(source, destination):
    with Image.open(source) as image:
        image = image.convert("RGB")
        crop_top = min(90, max(0, image.height // 20))
        sanitized = image.crop(
            (0, crop_top, image.width, image.height)
        )
        sanitized.save(destination, format="PNG")


def extract_json(text):
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("The VLM response did not contain a JSON object")
    return json.loads(cleaned[start:end + 1])


def percent(value):
    return f"{100.0 * float(value):.2f}%"


def build_verified_explanation(data, grounding, visual):
    horizons = grounding["risk_horizons_years"]
    risks = grounding["final_predicted_cumulative_risk"]
    risk_text = ", ".join(
        f"{year}-year {percent(risk)}"
        for year, risk in zip(horizons, risks)
    )

    prefix_risks = [
        exam["risk_after_this_examination"][-1]
        for exam in grounding["examinations"]
    ]
    prefix_text = ", ".join(
        f"after examination {index}: {percent(risk)}"
        for index, risk in enumerate(prefix_risks, start=1)
    )

    attention = []
    for exam in grounding["examinations"]:
        views = exam["available_views"]
        if not views:
            continue
        highest = max(
            views,
            key=lambda item: item["view_attention_weight"],
        )
        cell = highest["strongest_attention_cell"]
        attention.append(
            "Examination "
            + str(exam["examination_number"])
            + ": the highest view-attention weight was "
            + highest["view"]
            + f" ({highest['view_attention_weight']:.3f}); "
            + "its strongest 8x8 attention cell was row "
            + str(cell["row"])
            + ", column "
            + str(cell["column"])
            + "."
        )

    attention.append(
        "Guarded VLM visual description: "
        + visual["visual_attention_description"]
    )

    return {
        "summary": (
            f"The research model processed {data['sequence_length']} "
            f"examinations. Its final cumulative predictions were: "
            + risk_text
            + "."
        ),
        "temporal_risk_pattern": (
            "Using examination-prefix inference, the model's 5-year "
            "prediction was "
            + prefix_text
            + ". These are model prediction changes across available "
            "examinations, separate from the 1-to-5-year risk horizons."
        ),
        "attention_observations": attention,
        "limitations": [
            "Attention weights are associative model signals and are not causal evidence.",
            "Attention may include acquisition labels, image borders, or background.",
            "This is a research explanation of model behaviour and must not be used as a clinical diagnosis.",
        ],
        "vlm_visible_focus_cautions": visual[
            "visible_focus_cautions"
        ],
    }


def main():
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is required for VLM inference")

    json_paths = sorted(INPUT_DIR.glob("*.json"))
    if len(json_paths) != 5:
        raise RuntimeError(
            f"Expected five VLM inputs, found {len(json_paths)}"
        )

    SANITIZED_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    existing = list(OUTPUT_DIR.glob("qwen25vl3b_case_*.json"))
    if existing:
        raise FileExistsError(
            "VLM outputs already exist and were not overwritten"
        )

    print("Loading Qwen2.5-VL-3B-Instruct...")
    model = Qwen2_5_VLForConditionalGeneration.from_pretrained(
        MODEL_DIR,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        attn_implementation="eager",
        local_files_only=True,
    )
    processor = AutoProcessor.from_pretrained(
        MODEL_DIR,
        local_files_only=True,
        min_pixels=256 * 28 * 28,
        max_pixels=1024 * 28 * 28,
    )
    model.eval()

    manifest = []
    for number, json_path in enumerate(json_paths, start=1):
        neutral_id = f"case_{number:02d}"
        data = json.loads(json_path.read_text(encoding="utf-8"))
        patient_index = int(data["patient_index"])
        figure_path = FIGURE_DIR / (
            json_path.stem + "_attention.png"
        )
        if not figure_path.is_file():
            raise FileNotFoundError(figure_path)

        sanitized_path = SANITIZED_DIR / (
            f"{neutral_id}_attention.png"
        )
        sanitize_figure(figure_path, sanitized_path)
        grounding = build_grounding(data)

        instruction = (
            "Perform a narrow visual quality-control task. The image is a "
            "montage with model-attention overlays. Describe only whether "
            "visible attention appears concentrated or diffuse and whether "
            "it overlaps image borders, dark background, or printed "
            "acquisition labels. View names such as L_CC and L_MLO are view "
            "identifiers, not quadrants or anatomical locations. Do not make "
            "anatomical, clinical, diagnostic, causal, outcome, lesion, "
            "pathology, or risk-region claims. Do not interpret image "
            "appearance. Return one JSON object with exactly two keys: "
            "visual_attention_description, which must be one short string, "
            "and visible_focus_cautions, which must be an array of short "
            "strings. Use neutral language."
        )

        messages = [{
            "role": "user",
            "content": [
                {"type": "image", "image": sanitized_path.as_uri()},
                {"type": "text", "text": instruction},
            ],
        }]
        prompt = processor.apply_chat_template(
            messages,
            tokenize=False,
            add_generation_prompt=True,
        )
        image_inputs, video_inputs = process_vision_info(messages)
        inputs = processor(
            text=[prompt],
            images=image_inputs,
            videos=video_inputs,
            padding=True,
            return_tensors="pt",
        ).to("cuda")

        with torch.inference_mode():
            generated = model.generate(
                **inputs,
                max_new_tokens=550,
                do_sample=False,
                use_cache=True,
            )
        trimmed = [
            output[len(input_ids):]
            for input_ids, output in zip(
                inputs.input_ids, generated
            )
        ]
        raw_text = processor.batch_decode(
            trimmed,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )[0]
        visual = extract_json(raw_text)

        required = {
            "visual_attention_description",
            "visible_focus_cautions",
        }
        if not required.issubset(visual):
            raise RuntimeError(
                f"Unexpected VLM fields for {neutral_id}: "
                f"{sorted(visual)}"
            )
        visual = {
            "visual_attention_description": visual[
                "visual_attention_description"
            ],
            "visible_focus_cautions": visual[
                "visible_focus_cautions"
            ],
        }
        visual_text = json.dumps(visual).lower()
        prohibited = [
            "cancer",
            "diagnos",
            "lesion",
            "malignan",
            "patholog",
            "treatment",
            "quadrant",
            "critical",
            "concerning",
            "suspicious",
            "high-risk",
            "high risk",
            "area of interest",
            "abnormal",
        ]
        violations = [
            term for term in prohibited
            if term in visual_text
        ]
        if violations:
            raise RuntimeError(
                f"Unsafe VLM wording for {neutral_id}: {violations}"
            )

        explanation = build_verified_explanation(
            data,
            grounding,
            visual,
        )

        output_record = {
            "schema_version": "1.0",
            "purpose": "research_explanation_not_diagnosis",
            "neutral_case_id": neutral_id,
            "patient_index": patient_index,
            "risk_model": data["model"],
            "vlm": "Qwen2.5-VL-3B-Instruct",
            "vlm_revision": MODEL_REVISION,
            "outcome_label_supplied_to_vlm": False,
            "generation_method": (
                "guarded_hybrid_vlm_with_verified_numeric_narrative"
            ),
            "grounding": grounding,
            "explanation": explanation,
            "source_json_sha256": sha256_file(json_path),
            "sanitized_figure_sha256": sha256_file(sanitized_path),
        }
        output_path = OUTPUT_DIR / (
            f"qwen25vl3b_{neutral_id}_patient_{patient_index}.json"
        )
        output_path.write_text(
            json.dumps(output_record, indent=2) + "\n",
            encoding="utf-8",
        )
        manifest.append({
            "neutral_case_id": neutral_id,
            "patient_index": patient_index,
            "output_file": output_path.name,
            "output_sha256": sha256_file(output_path),
        })
        print("Wrote:", output_path)

        del inputs, generated, trimmed
        torch.cuda.empty_cache()

    manifest_path = OUTPUT_DIR / "vlm_generation_manifest.json"
    manifest_path.write_text(
        json.dumps({
            "vlm": "Qwen2.5-VL-3B-Instruct",
            "revision": MODEL_REVISION,
            "cases": manifest,
            "test_set_evaluated": False,
            "outcome_labels_supplied_to_vlm": False,
        }, indent=2) + "\n",
        encoding="utf-8",
    )
    print("Cases:", len(manifest))
    print("GROUNDED LABEL-BLIND VLM GENERATION: PASS")


if __name__ == "__main__":
    main()
