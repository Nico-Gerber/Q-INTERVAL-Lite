#!/bin/bash
#SBATCH --job-name=v2c_front_smoke
#SBATCH --partition=milan-gpu
#SBATCH --account=oz508
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=32G
#SBATCH --time=00:30:00
#SBATCH --gres=gpu:a100:1
#SBATCH --output=logs/v2c_frontend_smoke_%j.out
#SBATCH --error=logs/v2c_frontend_smoke_%j.err

set -euo pipefail

WORKSPACE="/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint05/rebuild_repaired"
cd "$WORKSPACE"

module load gcc/11.3.0
module load openmpi/4.1.4
module load pytorch/1.12.1-cuda-11.7.0

source /home/ngerber/venvs/classical_future_risk_vihanga/bin/activate

python deployment/frontend_v2c/smoke_test.py \
    --path-input-json reports/v2c_frontend_smoke_input.json \
    --output-json "reports/v2c_frontend_smoke_output_${SLURM_JOB_ID}.json"
