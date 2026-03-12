import 'dotenv/config';
import * as fs from 'fs';
import { prepareNodeConfig } from '@arbitrum/chain-sdk';
import { zeroAddress } from 'viem';

/**
 * Generate Nitro node configuration from deployment output.
 *
 * Reads deployment.json (created by deploy-rollup.ts) and generates
 * the nodeConfig.json required by the Nitro node.
 */

const CHAIN_ID = Number(process.env.CHAIN_ID || 942070);

async function main() {
  if (!fs.existsSync('deployment.json')) {
    console.error('Error: deployment.json not found.');
    console.error('Run deploy:rollup first to create it.');
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
  console.log('Loaded deployment.json');
  console.log('  Chain ID:', deployment.chainId);
  console.log('  Rollup:', deployment.coreContracts.rollup);

  // Private keys for batch poster and validator (strip 0x prefix for Nitro)
  function resolveKey(envName: string): string {
    const val = process.env[envName];
    if (val && val.length > 10) return val.replace(/^0x/, '');
    return process.env.DEPLOYER_PRIVATE_KEY!.replace(/^0x/, '');
  }
  const batchPosterKey = resolveKey('BATCH_POSTER_PRIVATE_KEY');
  const validatorKey = resolveKey('VALIDATOR_PRIVATE_KEY');

  const nodeConfig = prepareNodeConfig({
    chainName: 'ArcadeDao',
    chainConfig: deployment.chainConfig,
    coreContracts: deployment.coreContracts,
    batchPosterPrivateKey: batchPosterKey,
    validatorPrivateKey: validatorKey,
    stakeToken: zeroAddress,
    parentChainId: 421614,
    parentChainIsArbitrum: true,
    parentChainRpcUrl: process.env.PARENT_CHAIN_RPC!,
    dasServerUrl: process.env.DAS_SERVER_URL ?? 'http://localhost:9877',
  });

  // Post-process: restore private keys (SDK masks them with "...")
  function deepSet(obj: any, path: string[], val: string | boolean) {
    let current = obj;
    for (let i = 0; i < path.length - 1; i++) {
      if (!current?.[path[i]]) return;
      current = current[path[i]];
    }
    if (current) current[path[path.length - 1]] = val;
  }
  deepSet(nodeConfig, ['node', 'batch-poster', 'parent-chain-wallet', 'private-key'], batchPosterKey);
  deepSet(nodeConfig, ['node', 'staker', 'parent-chain-wallet', 'private-key'], validatorKey);

  // Disable staker if same key as batch poster (Nitro v3.9+ rejects duplicates)
  if (batchPosterKey === validatorKey) {
    console.warn('Warning: Batch poster and staker share the same key.');
    console.warn('  Disabling staker (set separate keys for production).');
    deepSet(nodeConfig, ['node', 'staker', 'enable'], false);
  }

  // Inject deployed-at block number
  if (deployment.deployedAtBlock) {
    if (!nodeConfig.chain) nodeConfig.chain = {};
    if (!nodeConfig.chain['info-json']) {
      nodeConfig.chain['info-json'] = JSON.stringify([{
        'chain-id': deployment.chainId,
        'chain-name': 'ArcadeDao',
        'parent-chain-id': 421614,
        'chain-config': deployment.chainConfig,
        'rollup': {
          ...deployment.coreContracts,
          'deployed-at': deployment.deployedAtBlock,
        },
      }]);
    } else {
      try {
        let infoJson = typeof nodeConfig.chain['info-json'] === 'string'
          ? JSON.parse(nodeConfig.chain['info-json'])
          : nodeConfig.chain['info-json'];
        if (Array.isArray(infoJson) && infoJson[0]?.rollup) {
          infoJson[0].rollup['deployed-at'] = deployment.deployedAtBlock;
        }
        nodeConfig.chain['info-json'] = JSON.stringify(infoJson);
      } catch {
        console.warn('  Could not patch deployed-at into existing info-json');
      }
    }
    console.log('  Injected deployed-at block:', deployment.deployedAtBlock);
  } else {
    console.warn('Warning: deployment.json has no deployedAtBlock.');
    console.warn('  Node may fail. Re-run deploy:rollup to fix.');
  }

  // Fix malformed DAS URLs (SDK may produce double-port)
  let configJson = JSON.stringify(nodeConfig, null, 2);
  configJson = configJson.replace(/:(\d+):\1/g, ':$1');

  console.log('\nNode Configuration:');
  console.log(configJson);

  fs.writeFileSync('nodeConfig.json', configJson);
  console.log('\nSaved to nodeConfig.json');
  console.log('\nNext steps:');
  console.log('  1. Ensure data directories exist: mkdir -p data/arbitrum data/das');
  console.log('  2. Start Nitro node: docker-compose up -d');
}

main().catch(console.error);
