#!/bin/bash
#SBATCH --job-name=train_v2c
#SBATCH --partition=milan-c
#SBATCH --account=oz508
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=01:00:00
#SBATCH --gres=gpu:a100:1
#SBATCH --output=/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint06/logs/v2c_train_%j.out
#SBATCH --error=/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint06/logs/v2c_train_%j.err

set -euo pipefail

module load gcc/11.3.0
module load openmpi/4.1.4
module load pytorch/1.12.1-cuda-11.7.0

source ~/venvs/classical_future_risk_vihanga/bin/activate

cd /fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint06

export OMP_NUM_THREADS="$SLURM_CPUS_PER_TASK"
export CUBLAS_WORKSPACE_CONFIG=":4096:8"
export PYTHONPATH="/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint06/src:${PYTHONPATH:-}"

WEIGHTING="${WEIGHTING:-none}"
SEED="${SEED:-42}"
RUN_NAME="v2c_${WEIGHTING}_seed${SEED}_job${SLURM_JOB_ID}"

python -u scripts/train_v2c.py \
  --weighting "$WEIGHTING" \
  --seed "$SEED" \
  --run-name "$RUN_NAME"
