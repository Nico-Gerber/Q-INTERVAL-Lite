#!/bin/bash

#SBATCH --job-name=mclip_b5_spatial
#SBATCH --partition=milan-c
#SBATCH --account=oz508
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=8
#SBATCH --mem=32G
#SBATCH --time=02:00:00
#SBATCH --gres=gpu:a100:1
#SBATCH --output=experiments/v2c_mammoclip_b5/logs/extract_spatial_%j.out
#SBATCH --error=experiments/v2c_mammoclip_b5/logs/extract_spatial_%j.err

set -euo pipefail

PROJECT_DIR="/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint06"

cd "$PROJECT_DIR"

module load gcc/11.3.0
module load openmpi/4.1.4
module load python-scientific/3.10.4-foss-2022a

source ~/venvs/mammoclip_sprint06/bin/activate

export OMP_NUM_THREADS="$SLURM_CPUS_PER_TASK"

python -u experiments/v2c_mammoclip_b5/scripts/extract_mammoclip_b5_spatial_features.py \
    | tee "experiments/v2c_mammoclip_b5/reports/extract_spatial_${SLURM_JOB_ID}.txt"
