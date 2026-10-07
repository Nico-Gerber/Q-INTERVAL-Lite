#!/bin/bash

#SBATCH --job-name=build_sequences
#SBATCH --partition=milan
#SBATCH --account=oz508
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=00:30:00
#SBATCH --output=logs/build_sequences_%j.out
#SBATCH --error=logs/build_sequences_%j.err

set -euo pipefail

PROJECT_DIR="/fred/oz508/EMBED/classical_future_risk_vihanga"

cd "$PROJECT_DIR"

module load gcc/11.3.0
module load openmpi/4.1.4
module load pytorch/1.12.1-cuda-11.7.0

source ~/venvs/classical_future_risk_vihanga/bin/activate

export OMP_NUM_THREADS="$SLURM_CPUS_PER_TASK"

python scripts/build_lstm_sequences.py \
    | tee "reports/build_sequences_${SLURM_JOB_ID}.txt"
