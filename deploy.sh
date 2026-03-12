#!/usr/bin/env bash
set -euo pipefail

# Load environment variables
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

echo "=== ArcadeDao - Full Deployment ==="

echo ""
echo "Step 1: Deploy rollup contracts..."
npx tsx scripts/deploy-rollup.ts

if [ ! -f deployment.json ]; then
  echo "ERROR: deployment.json not created. Rollup deployment may have failed."
  exit 1
fi

echo ""
echo "Step 2: Generate node config..."
npx tsx scripts/prepare-node-config.ts

echo ""
echo "Step 3: Start node (manual step)..."
echo "  Run: docker-compose up -d"
echo "  Wait for the node to sync, then continue with token bridge deployment."
echo "  Press ENTER to continue when the node is ready, or Ctrl+C to stop."
read -r

echo ""
echo "Step 4: Deploy token bridge..."
npx tsx scripts/deploy-token-bridge.ts

echo ""
echo "=== Deployment complete! ==="
echo "Deployment output saved to deployment.json"
echo "Node config saved to nodeConfig.json"
