#!/bin/bash

#SBATCH --job-name=view_slot_audit
#SBATCH --partition=milan
#SBATCH --account=oz508
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=1
#SBATCH --mem=8G
#SBATCH --time=00:20:00
#SBATCH --output=logs/view_slot_audit_%j.out
#SBATCH --error=logs/view_slot_audit_%j.err

set -euo pipefail

PROJECT_DIR="/fred/oz508/EMBED/classical_future_risk_vihanga"

cd "$PROJECT_DIR"

module load gcc/13.3.0
module load python/3.12.3
source ~/venvs/embed_clean/bin/activate

python scripts/audit_selected_view_slots.py \
    | tee "reports/selected_view_slot_audit_${SLURM_JOB_ID}.txt"
