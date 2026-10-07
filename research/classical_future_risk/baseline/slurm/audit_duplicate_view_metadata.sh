#!/bin/bash

#SBATCH --job-name=duplicate_metadata
#SBATCH --partition=milan
#SBATCH --account=oz508
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=1
#SBATCH --mem=8G
#SBATCH --time=00:20:00
#SBATCH --output=logs/duplicate_metadata_%j.out
#SBATCH --error=logs/duplicate_metadata_%j.err

set -euo pipefail

PROJECT_DIR="/fred/oz508/EMBED/classical_future_risk_vihanga"

cd "$PROJECT_DIR"

module load gcc/13.3.0
module load python/3.12.3
source ~/venvs/embed_clean/bin/activate

python scripts/audit_duplicate_view_metadata.py \
    | tee "reports/duplicate_view_metadata_${SLURM_JOB_ID}.txt"
