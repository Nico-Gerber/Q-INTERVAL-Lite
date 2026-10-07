#!/bin/bash

#SBATCH --job-name=screening_audit
#SBATCH --partition=milan
#SBATCH --account=oz508
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=00:15:00
#SBATCH --output=/fred/oz508/EMBED/classical_future_risk_vihanga/logs/screening_audit_%j.out
#SBATCH --error=/fred/oz508/EMBED/classical_future_risk_vihanga/logs/screening_audit_%j.err

set -euo pipefail

module load gcc/13.3.0
module load python/3.12.3

source ~/venvs/embed_clean/bin/activate

WORK_DIR="/fred/oz508/EMBED/classical_future_risk_vihanga"

cd "$WORK_DIR"

python scripts/audit_screening_eligibility.py \
    | tee "reports/screening_eligibility_audit_${SLURM_JOB_ID}.txt"
