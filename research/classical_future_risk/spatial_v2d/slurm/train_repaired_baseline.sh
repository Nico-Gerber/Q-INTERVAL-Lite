#!/bin/bash

#SBATCH --job-name=base_repair
#SBATCH --partition=milan-gpu
#SBATCH --account=oz508
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=01:00:00
#SBATCH --gres=gpu:a100:1
#SBATCH --output=logs/repaired_baseline_%j.out
#SBATCH --error=logs/repaired_baseline_%j.err

set -euo pipefail

PROJECT_DIR="/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint06"

cd "$PROJECT_DIR"

module load gcc/11.3.0
module load openmpi/4.1.4
module load pytorch/1.12.1-cuda-11.7.0

source ~/venvs/classical_future_risk_vihanga/bin/activate

export OMP_NUM_THREADS="$SLURM_CPUS_PER_TASK"
export CUBLAS_WORKSPACE_CONFIG=":4096:8"

python scripts/train_repaired_baseline.py \
    | tee "reports/repaired_baseline_${SLURM_JOB_ID}.txt"
