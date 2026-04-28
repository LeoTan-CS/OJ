#!/usr/bin/env bash
set -euo pipefail

dotenv_get() {
  local key="$1"
  local line value
  [[ -f .env ]] || return 1
  line="$(grep -E "^${key}=" .env | tail -n 1 || true)"
  [[ -n "$line" ]] || return 1
  value="${line#*=}"
  value="${value%$'\r'}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "$value"
}

MODEL_SINGULARITY_COMMAND="${MODEL_SINGULARITY_COMMAND:-$(dotenv_get MODEL_SINGULARITY_COMMAND || true)}"
MODEL_SINGULARITY_IMAGE="${MODEL_SINGULARITY_IMAGE:-$(dotenv_get MODEL_SINGULARITY_IMAGE || true)}"
MODEL_RUNTIME_DOCKER_IMAGE="${MODEL_RUNTIME_DOCKER_IMAGE:-$(dotenv_get MODEL_RUNTIME_DOCKER_IMAGE || true)}"
MODEL_RUNTIME_FORCE_PULL="${MODEL_RUNTIME_FORCE_PULL:-$(dotenv_get MODEL_RUNTIME_FORCE_PULL || true)}"

SINGULARITY_COMMAND="${MODEL_SINGULARITY_COMMAND:-singularity}"
RUNTIME_IMAGE="${MODEL_RUNTIME_DOCKER_IMAGE:-huggingface/transformers-pytorch-gpu:latest}"
SIF_PATH="${MODEL_SINGULARITY_IMAGE:-$(pwd)/runtime/model-eval.sif}"
FORCE_PULL="${MODEL_RUNTIME_FORCE_PULL:-0}"

if ! command -v "$SINGULARITY_COMMAND" >/dev/null 2>&1; then
  echo "Singularity command not found: $SINGULARITY_COMMAND" >&2
  echo "Install singularity, or set MODEL_SINGULARITY_COMMAND to the executable path." >&2
  exit 127
fi

mkdir -p "$(dirname "$SIF_PATH")"

if [[ -f "$SIF_PATH" && "$FORCE_PULL" != "1" ]]; then
  echo "SIF already exists: $SIF_PATH"
  echo "Skip pulling. Set MODEL_RUNTIME_FORCE_PULL=1 to update it."
else
  echo "Pulling docker://$RUNTIME_IMAGE"
  echo "Writing SIF to $SIF_PATH"
  "$SINGULARITY_COMMAND" pull --force "$SIF_PATH" "docker://$RUNTIME_IMAGE"
fi

echo "Verifying Python ML libraries in $SIF_PATH"
"$SINGULARITY_COMMAND" exec --nv "$SIF_PATH" python3 - <<'PY'
import importlib

required = [
    "torch",
    "transformers",
    "accelerate",
    "datasets",
    "safetensors",
    "tokenizers",
    "numpy",
    "tqdm",
]

missing = []
for name in required:
    try:
        module = importlib.import_module(name)
        version = getattr(module, "__version__", "unknown")
        print(f"{name}: {version}")
    except Exception as exc:
        missing.append(f"{name} ({exc})")

if missing:
    raise SystemExit("Missing required libraries: " + ", ".join(missing))

import torch
print("cuda_available:", torch.cuda.is_available())
print("torch_cuda:", torch.version.cuda)
PY

cat <<EOF

Done.
Add this to .env:

MODEL_SINGULARITY_IMAGE=$SIF_PATH
MODEL_SINGULARITY_COMMAND=$SINGULARITY_COMMAND
MODEL_SINGULARITY_SCRATCH_ROOT=/tmp
MODEL_SINGULARITY_ENABLE_NV=1
EOF
