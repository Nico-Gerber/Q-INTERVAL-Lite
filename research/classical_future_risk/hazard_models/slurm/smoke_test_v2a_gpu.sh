#!/bin/bash
#SBATCH --job-name=v2a_gpu_smoke
#SBATCH --partition=milan-gpu
#SBATCH --account=oz508
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=4
#SBATCH --mem=16G
#SBATCH --time=00:10:00
#SBATCH --gres=gpu:a100:1
#SBATCH --output=/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint05/logs/v2a_gpu_smoke_%j.out
#SBATCH --error=/fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint05/logs/v2a_gpu_smoke_%j.err

set -euo pipefail

module load gcc/11.3.0
module load openmpi/4.1.4
module load pytorch/1.12.1-cuda-11.7.0

source ~/venvs/classical_future_risk_vihanga/bin/activate

cd /fred/oz508/EMBED/classical_future_risk_vihanga/v2_hazard_sprint05

export OMP_NUM_THREADS="$SLURM_CPUS_PER_TASK"
export CUBLAS_WORKSPACE_CONFIG=":4096:8"
export PYTHONPATH="$PWD/src:${PYTHONPATH:-}"

which python

python - <<'PY'
import numpy
import pandas
import torch

print("NumPy:", numpy.__version__)
print("Pandas:", pandas.__version__)
print("PyTorch:", torch.__version__)
print("Compiled CUDA:", torch.version.cuda)
print("CUDA available:", torch.cuda.is_available())
PY

python -u scripts/smoke_test_v2a_gpu.py
