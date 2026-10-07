#!/bin/bash
#SBATCH --job-name=baseline_infer
#SBATCH --partition=milan-gpu
#SBATCH --account=oz508
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=32G
#SBATCH --time=00:30:00
#SBATCH --gres=gpu:a100:1
#SBATCH --output=logs/baseline_inference_%j.out
#SBATCH --error=logs/baseline_inference_%j.err

set -euo pipefail

PROJECT_DIR="/fred/oz508/EMBED/classical_future_risk_vihanga"
cd "$PROJECT_DIR"

module load gcc/11.3.0
module load openmpi/4.1.4
module load pytorch/1.12.1-cuda-11.7.0

source ~/venvs/classical_future_risk_vihanga/bin/activate

export TORCH_HOME="$PROJECT_DIR/models/torch_cache"

INPUT_JSON="$PROJECT_DIR/reports/baseline_inference_input_${SLURM_JOB_ID}.json"
OUTPUT_JSON="$PROJECT_DIR/reports/baseline_inference_output_${SLURM_JOB_ID}.json"

python scripts/create_baseline_inference_smoke_input.py \
    --output-json "$INPUT_JSON"

python scripts/baseline_inference.py \
    --input-json "$INPUT_JSON" \
    --output-json "$OUTPUT_JSON" \
    --device cuda

python - "$OUTPUT_JSON" <<'PY'
import json
import sys

path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    result = json.load(handle)

assert result["status"] == "success"
assert 2 <= result["input_summary"]["num_sessions"] <= 5
assert result["input_summary"]["num_images"] >= 2
assert len(result["model_scores"]) == 5
assert len(result["session_influences"]) == result["input_summary"]["num_sessions"]

for score in result["model_scores"].values():
    assert 0.0 <= score <= 1.0

print("INFERENCE SMOKE TEST: PASS")
print("Output JSON:", path)
PY
