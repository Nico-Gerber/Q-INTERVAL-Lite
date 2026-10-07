#!/bin/bash

#SBATCH --job-name=patient_split
#SBATCH --partition=milan
#SBATCH --account=oz508
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=1
#SBATCH --mem=4G
#SBATCH --time=00:10:00
#SBATCH --output=logs/patient_split_%j.out
#SBATCH --error=logs/patient_split_%j.err

set -euo pipefail

PROJECT_DIR="/fred/oz508/EMBED/classical_future_risk_vihanga"

cd "$PROJECT_DIR"

module load gcc/13.3.0
module load python/3.12.3
source ~/venvs/embed_clean/bin/activate

python scripts/create_patient_splits.py \
    | tee "reports/patient_split_${SLURM_JOB_ID}.txt"
