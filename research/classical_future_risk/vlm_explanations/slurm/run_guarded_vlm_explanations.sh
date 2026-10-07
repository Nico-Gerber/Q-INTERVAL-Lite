#!/bin/bash
#SBATCH --job-name=v2d_vlm_guarded
#SBATCH --partition=milan-c
#SBATCH --account=oz508
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=32G
#SBATCH --time=01:00:00
#SBATCH --gres=gpu:a100:1
#SBATCH --output=/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint06/experiments/v2c_mammoclip_b5/logs/vlm/generate_guarded_%j.out
#SBATCH --error=/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint06/experiments/v2c_mammoclip_b5/logs/vlm/generate_guarded_%j.err

set -euo pipefail

module load gcc/11.3.0
module load python/3.10.4

source /fred/oz508/EMBED/classical_future_risk_vihanga/venvs/vlm_sprint06/bin/activate

cd /fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint06

export HF_HOME="/fred/oz508/EMBED/classical_future_risk_vihanga/models/huggingface"
export TRANSFORMERS_OFFLINE=1
export HF_HUB_OFFLINE=1
export TOKENIZERS_PARALLELISM=false
export OMP_NUM_THREADS="$SLURM_CPUS_PER_TASK"

python -u \
  experiments/v2c_mammoclip_b5/scripts/run_guarded_vlm_explanations.py
