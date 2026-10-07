#!/bin/bash

#SBATCH --job-name=classical_gpu_test
#SBATCH --partition=milan-c
#SBATCH --account=oz508
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=00:10:00
#SBATCH --gres=gpu:a100:1
#SBATCH --output=logs/gpu_test_%j.out
#SBATCH --error=logs/gpu_test_%j.err

set -euo pipefail

PROJECT_DIR="/fred/oz508/EMBED/classical_future_risk_vihanga"

cd "$PROJECT_DIR"

module load gcc/11.3.0
module load openmpi/4.1.4
module load pytorch/1.12.1-cuda-11.7.0

source ~/venvs/classical_future_risk_vihanga/bin/activate

python scripts/test_gpu_environment.py \
    | tee "reports/gpu_test_${SLURM_JOB_ID}.txt"
