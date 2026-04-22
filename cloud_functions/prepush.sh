#!/usr/bin/env sh
# Vendors `backend/vibejobber` so Firebase can deploy it inside `functions/`.
# Run from `cloud_functions/` (also used as Firebase `predeploy`).

set -e
cd "$(dirname "$0")"
rm -rf functions/vibejobber
cp -R ../backend/vibejobber functions/vibejobber
echo "Synced backend/vibejobber → functions/vibejobber"
