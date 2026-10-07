#!/bin/bash
#SBATCH --job-name=v2b_s2026
#SBATCH --partition=milan-gpu
#SBATCH --account=oz508
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=01:00:00
#SBATCH --gres=gpu:a100:1
#SBATCH --output=/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint05/logs/v2b_seed2026_train_%j.out
#SBATCH --error=/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint05/logs/v2b_seed2026_train_%j.err

set -euo pipefail

module load gcc/11.3.0
module load openmpi/4.1.4
module load pytorch/1.12.1-cuda-11.7.0

source ~/venvs/classical_future_risk_vihanga/bin/activate

cd /fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint05

export OMP_NUM_THREADS="$SLURM_CPUS_PER_TASK"
export CUBLAS_WORKSPACE_CONFIG=":4096:8"
export PYTHONPATH="$PWD/src:${PYTHONPATH:-}"

WEIGHTING="${WEIGHTING:-none}"
RUN_NAME="v2b_${WEIGHTING}_seed2026_job${SLURM_JOB_ID}"

python -u scripts/train_v2b_extended.py \
  --weighting "$WEIGHTING" \
  --seed 2026 \
  --run-name "$RUN_NAME"
