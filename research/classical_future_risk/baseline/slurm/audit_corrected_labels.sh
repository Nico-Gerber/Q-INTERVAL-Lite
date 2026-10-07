#!/bin/bash

#SBATCH --job-name=classical_label_audit
#SBATCH --partition=milan
#SBATCH --account=oz508
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=2
#SBATCH --mem=8G
#SBATCH --time=00:30:00
#SBATCH --output=/fred/oz508/EMBED/classical_future_risk_vihanga/logs/label_audit_%j.out
#SBATCH --error=/fred/oz508/EMBED/classical_future_risk_vihanga/logs/label_audit_%j.err

set -euo pipefail

module load gcc/13.3.0
module load python/3.12.3

source ~/venvs/embed_clean/bin/activate

WORK_DIR="/fred/oz508/EMBED/classical_future_risk_vihanga"

cd "$WORK_DIR"

python scripts/audit_corrected_labels.py \
    | tee "reports/corrected_label_audit_${SLURM_JOB_ID}.txt"
