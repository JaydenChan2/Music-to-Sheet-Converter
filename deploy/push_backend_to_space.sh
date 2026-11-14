#!/usr/bin/env bash
# Copy the backend into a Hugging Face Space repo and push it.
#   deploy/push_backend_to_space.sh https://huggingface.co/spaces/<you>/<space-name>
set -euo pipefail
SPACE_URL="${1:?usage: $0 https://huggingface.co/spaces/<you>/<space-name>}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git clone --depth 1 "$SPACE_URL" "$WORK/space"
rsync -a --delete --exclude-from="$ROOT/backend/.dockerignore" --exclude .git \
  --exclude 'README.md' --exclude 'SPACE_README.md' "$ROOT/backend/" "$WORK/space/"
cp "$ROOT/backend/SPACE_README.md" "$WORK/space/README.md"

cd "$WORK/space"
git add -A
if git diff --cached --quiet; then
  echo "Nothing changed."
else
  git commit -m "Update backend from $(cd "$ROOT" && git rev-parse --short HEAD)"
  git push
  echo "Pushed. The Space rebuilds automatically - watch the build log on its page."
fi
