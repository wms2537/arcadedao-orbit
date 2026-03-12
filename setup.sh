#!/usr/bin/env bash
set -euo pipefail

echo "=== ArcadeDao - Orbit Chain Setup ==="

# Install dependencies
echo "Installing dependencies..."
npm install

# Create data directories for Docker bind mounts
mkdir -p data/arbitrum data/das das-keys

# Copy env template if .env doesn't exist
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from template - edit it with your keys before deploying."
fi

echo ""
echo "Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Edit .env with your DEPLOYER_PRIVATE_KEY and PARENT_CHAIN_RPC"
echo "  2. Deploy ARCADE token:  npm run deploy:token"
echo "  3. Set ARCADE_TOKEN_ADDRESS in .env"
echo "  4. Deploy rollup:        npm run deploy:rollup"
echo "  5. Generate node config: npm run config:node"
echo "  6. Start Nitro node:     docker-compose up -d"
echo "  7. Deploy token bridge:  npm run deploy:token-bridge"
echo "  8. Configure AnyTrust:   npm run config:anytrust"
