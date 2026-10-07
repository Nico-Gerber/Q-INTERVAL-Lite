#!/bin/bash

#SBATCH --job-name=baseline_evaluation
#SBATCH --partition=milan
#SBATCH --account=oz508
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=2
#SBATCH --mem=4G
#SBATCH --time=00:20:00
#SBATCH --output=logs/baseline_evaluation_%j.out
#SBATCH --error=logs/baseline_evaluation_%j.err

set -euo pipefail

PROJECT_DIR="/fred/oz508/EMBED/classical_future_risk_vihanga"

cd "$PROJECT_DIR"

module load gcc/11.3.0
module load openmpi/4.1.4
module load pytorch/1.12.1-cuda-11.7.0

source ~/venvs/classical_future_risk_vihanga/bin/activate

python scripts/evaluate_lstm_baseline.py \
    | tee "reports/baseline_evaluation_${SLURM_JOB_ID}.txt"
