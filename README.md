# ArcadeDao

Gaming L3 chain on Arbitrum Orbit using AnyTrust for low-cost, fast-finality gameplay transactions.

## Architecture

| Parameter | Value |
|-----------|-------|
| Chain ID | 942070 |
| Chain Type | AnyTrust (DAC) |
| Gas Token | ARCADE (custom ERC-20) |
| Parent Chain | Arbitrum Sepolia |
| Challenge Protocol | BoLD v3.1 |

## Project Structure

```
arcadedao/
  scripts/
    deploy-arcade-token.ts    # Deploy ARCADE ERC-20 on parent chain
    deploy-rollup.ts          # Deploy Orbit rollup contracts -> deployment.json
    deploy-token-bridge.ts    # Deploy token bridge (reads deployment.json)
    fetch-bridge-addresses.ts # Fetch already-deployed bridge addresses
    prepare-node-config.ts    # Generate Nitro node config (reads deployment.json)
    configure-anytrust.ts     # Register DAC keyset on SequencerInbox
    manage-validators.ts      # Check validator/batch poster status
    manage-governance.ts      # Manage UpgradeExecutor roles (grant/revoke)
  contracts/
    src/ArcadeToken.sol       # ARCADE ERC-20 token contract
    foundry.toml              # Foundry config
  docker-compose.yml          # Nitro node + DAS server
  das-keys/                   # BLS keys for DAC (generated)
  deployment.json             # All deployed contract addresses (generated)
  nodeConfig.json             # Nitro node configuration (generated)
  package.json
  tsconfig.json
  .env.example
  setup.sh                    # Initial setup
  deploy.sh                   # Full deployment script
```

## Quick Start

```bash
# 1. Install dependencies and create .env
bash setup.sh

# 2. Edit .env with your DEPLOYER_PRIVATE_KEY

# 3. Deploy ARCADE token on Arbitrum Sepolia
npm run deploy:token

# 4. Set ARCADE_TOKEN_ADDRESS in .env

# 5. Deploy rollup (saves to deployment.json)
npm run deploy:rollup

# 6. Generate node config
npm run config:node

# 7. Generate BLS keys for DAS
docker run --rm --entrypoint /usr/local/bin/datool \
  -v $(pwd)/das-keys:/keys \
  offchainlabs/nitro-node:v3.9.4-7f582c3 keygen --dir /keys

# 8. Start Nitro node + DAS server
mkdir -p data/arbitrum data/das
docker-compose up -d

# 9. Deploy token bridge
npm run deploy:token-bridge

# 10. Register DAC keyset on SequencerInbox
npm run config:anytrust

# 11. Check governance status
npm run manage:governance status
```

## AnyTrust DAC Setup

Generate BLS keys for DAC members:
```bash
docker run --rm --entrypoint /usr/local/bin/datool \
  -v $(pwd)/das-keys:/keys \
  offchainlabs/nitro-node:v3.9.4-7f582c3 keygen --dir /keys
```

The `configure-anytrust.ts` script automatically reads the BLS public key from `das-keys/das_bls.pub` and registers it on the SequencerInbox via the UpgradeExecutor:
```bash
npm run config:anytrust
```

## Governance

The UpgradeExecutor controls chain upgrades. The deployer has `EXECUTOR_ROLE` by default.

```bash
# Check current role holders
npm run manage:governance status

# Transfer governance to a multisig
npm run manage:governance grant <multisig-address>

# Revoke deployer access (requires CONFIRM_REVOKE=true)
CONFIRM_REVOKE=true npm run manage:governance revoke <deployer-address>
```

## Deployment Proof (Arbitrum Sepolia)

All contracts are deployed and verified on Arbitrum Sepolia (chain ID 421614). Transaction hashes link to Arbiscan.

### Deployment Transactions

| Step | Transaction | Block |
|------|-------------|-------|
| ARCADE Token Deploy | [`0x78926558...f234bb`](https://sepolia.arbiscan.io/tx/0x78926558a56ccaedb6726000f67b7670cb73928c036cb1164449ae0917f234bb) | 248154944 |
| Token Approval (RollupCreator) | [`0xc853d5c6...8a0a25`](https://sepolia.arbiscan.io/tx/0xc853d5c6cc226bf1331997c8c77ce7a00deb8818b935f23a5af4db78758a0a25) | 248155035 |
| Rollup Creation (createRollup) | [`0xa1e7f3ec...83557f`](https://sepolia.arbiscan.io/tx/0xa1e7f3ec5b2c2b9c99192f0685050db155bf7b62ee3dc80be428c9e92083557f) | 248155073 |
| Token Bridge Deploy | [`0xd4b8df6a...c05123`](https://sepolia.arbiscan.io/tx/0xd4b8df6a42a6e356e1190d290d572e3db2197a72eb7bf57c4fa40e2cafc05123) | 248161253 |
| DAC Keyset Registration | [`0x77927e24...a1be3a`](https://sepolia.arbiscan.io/tx/0x77927e24a3d7180d283afae159ac12c049f7e627e6c69c5fab34dc000aa1be3a) | 248163254 |

### Core Contracts

| Contract | Address |
|----------|---------|
| ARCADE Token | [`0x7C1505aD7B5E863E585AAAe014041a29963217Bf`](https://sepolia.arbiscan.io/address/0x7C1505aD7B5E863E585AAAe014041a29963217Bf) |
| Rollup | [`0x358754Ba9Abd40a0975AD2Fbb60465EBa45d805F`](https://sepolia.arbiscan.io/address/0x358754Ba9Abd40a0975AD2Fbb60465EBa45d805F) |
| Inbox | [`0xF6C060d5Dc31DDbC5CdbC9Acb907f9d719C01182`](https://sepolia.arbiscan.io/address/0xF6C060d5Dc31DDbC5CdbC9Acb907f9d719C01182) |
| Outbox | [`0x27c499F4A081E39dA6271b4985DC481Fcad59716`](https://sepolia.arbiscan.io/address/0x27c499F4A081E39dA6271b4985DC481Fcad59716) |
| Bridge | [`0x6906E5cF83e0b4bB8C3401E9159cfbB8DA35DD83`](https://sepolia.arbiscan.io/address/0x6906E5cF83e0b4bB8C3401E9159cfbB8DA35DD83) |
| SequencerInbox | [`0xddF740324Eb76d535838449b9131688F31254002`](https://sepolia.arbiscan.io/address/0xddF740324Eb76d535838449b9131688F31254002) |
| UpgradeExecutor | [`0x8e14F8716282a377A3F62c7ae99974320c329b9D`](https://sepolia.arbiscan.io/address/0x8e14F8716282a377A3F62c7ae99974320c329b9D) |

### Token Bridge (Parent Chain - Arbitrum Sepolia)

| Contract | Address |
|----------|---------|
| Router | [`0x25687edA7a73444B8ddC2A9692569709736F6757`](https://sepolia.arbiscan.io/address/0x25687edA7a73444B8ddC2A9692569709736F6757) |
| Standard Gateway | [`0x91aedBBd01d9504E8DaD5c962BCA1D48f86980A7`](https://sepolia.arbiscan.io/address/0x91aedBBd01d9504E8DaD5c962BCA1D48f86980A7) |
| Custom Gateway | [`0x2136c324d73b1D9c320ae9C1F278492e4b5C7457`](https://sepolia.arbiscan.io/address/0x2136c324d73b1D9c320ae9C1F278492e4b5C7457) |

### Token Bridge (Orbit Chain - ArcadeDao L3)

| Contract | Address |
|----------|---------|
| Router | [`0xeED90Fa3A78d54AD8431083DFd6c5BbB040e234F`](https://sepolia.arbiscan.io/address/0xeED90Fa3A78d54AD8431083DFd6c5BbB040e234F) |
| Standard Gateway | [`0xbC5895942B2066046136ff5E038b35fC11dA3Ebc`](https://sepolia.arbiscan.io/address/0xbC5895942B2066046136ff5E038b35fC11dA3Ebc) |
| Custom Gateway | [`0x3016f46de1caa8b8F34C5CE4020932Df66CD726A`](https://sepolia.arbiscan.io/address/0x3016f46de1caa8b8F34C5CE4020932Df66CD726A) |

### DAC Keyset

| Parameter | Value |
|-----------|-------|
| Keyset Hash | `0x56773492de5c1c10fff547558dd3f885e8cbbd9446276ae6b3ba81b57714f198` |
| Assumed Honest | 1 |
| DAC Members | 1 |

## L3 RPC Endpoints

- HTTP: `http://localhost:8449`
- WebSocket: `ws://localhost:8548`
- DAS REST: `http://localhost:9877`
- DAS RPC: `http://localhost:9876`

## Deployment Output

All deployment data is persisted to `deployment.json`. Downstream scripts (token bridge, node config, DAC keyset, governance) automatically read from this file.

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run setup` | Install deps, create .env |
| `npm run deploy:token` | Deploy ARCADE ERC-20 |
| `npm run deploy:rollup` | Deploy Orbit rollup contracts |
| `npm run deploy:token-bridge` | Deploy token bridge |
| `npm run fetch:bridge` | Fetch bridge contract addresses |
| `npm run config:node` | Generate Nitro node config |
| `npm run config:anytrust` | Register DAC keyset |
| `npm run manage:validators` | Check validator status |
| `npm run manage:governance` | Manage governance roles |
| `npm run deploy` | Full deployment (interactive) |

## References

- [Orbit Chain Docs](https://docs.arbitrum.io/launch-orbit-chain/orbit-gentle-introduction)
- [Orbit SDK](https://github.com/OffchainLabs/arbitrum-orbit-sdk)
- [Nitro Node Setup](https://docs.arbitrum.io/run-arbitrum-node/run-full-node)
- [AnyTrust Configuration](https://docs.arbitrum.io/launch-orbit-chain/how-tos/orbit-sdk-deploying-anytrust-chain)
