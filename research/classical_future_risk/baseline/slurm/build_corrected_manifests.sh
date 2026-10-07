#!/bin/bash

#SBATCH --job-name=build_manifests
#SBATCH --partition=milan
#SBATCH --account=oz508
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=1
#SBATCH --mem=16G
#SBATCH --time=00:30:00
#SBATCH --output=logs/build_manifests_%j.out
#SBATCH --error=logs/build_manifests_%j.err

set -euo pipefail

PROJECT_DIR="/fred/oz508/EMBED/classical_future_risk_vihanga"

cd "$PROJECT_DIR"

module load gcc/13.3.0
module load python/3.12.3
source ~/venvs/embed_clean/bin/activate

python scripts/build_corrected_manifests.py \
    | tee "reports/build_corrected_manifests_${SLURM_JOB_ID}.txt"
