#!/bin/bash

#SBATCH --job-name=resnet50_features
#SBATCH --partition=milan-c
#SBATCH --account=oz508
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8
#SBATCH --mem=32G
#SBATCH --time=02:00:00
#SBATCH --gres=gpu:a100:1
#SBATCH --output=logs/resnet50_features_%j.out
#SBATCH --error=logs/resnet50_features_%j.err

set -euo pipefail

PROJECT_DIR="/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint05/rebuild_repaired"

cd "$PROJECT_DIR"

module load gcc/11.3.0
module load openmpi/4.1.4
module load pytorch/1.12.1-cuda-11.7.0

source ~/venvs/classical_future_risk_vihanga/bin/activate

export TORCH_HOME="$PROJECT_DIR/models/torch_cache"
export OMP_NUM_THREADS="$SLURM_CPUS_PER_TASK"

python scripts/extract_resnet50_features.py \
    | tee "reports/resnet50_features_${SLURM_JOB_ID}.txt"
