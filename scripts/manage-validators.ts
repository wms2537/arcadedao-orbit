import 'dotenv/config';
import * as fs from 'fs';
import {
  createPublicClient,
  http,
  Chain,
} from 'viem';

/**
 * Check validator and batch poster status for the ArcadeDao chain.
 *
 * Reads contract addresses from deployment.json.
 */

const rollupAbi = [
  {
    name: 'isValidator',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'validator', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const sequencerInboxAbi = [
  {
    name: 'isBatchPoster',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const parentChain: Chain = {
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.PARENT_CHAIN_RPC!] },
  },
};

async function main() {
  const publicClient = createPublicClient({
    chain: parentChain,
    transport: http(process.env.PARENT_CHAIN_RPC),
  });

  if (!fs.existsSync('deployment.json')) {
    console.error('Error: deployment.json not found. Run deploy:rollup first.');
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
  const rollupAddress = deployment.coreContracts.rollup as `0x${string}`;
  const sequencerInboxAddress = deployment.coreContracts.sequencerInbox as `0x${string}`;
  console.log('Loaded contract addresses from deployment.json');

  // Add addresses to check here
  const addressesToCheck: `0x${string}`[] = [
    deployment.deployer as `0x${string}`,
  ];

  console.log('\n=== Validator Status ===');
  console.log('  Rollup:', rollupAddress);
  for (const addr of addressesToCheck) {
    const isValidator = await publicClient.readContract({
      address: rollupAddress,
      abi: rollupAbi,
      functionName: 'isValidator',
      args: [addr],
    });
    console.log(`  ${addr}: ${isValidator ? 'VALIDATOR' : 'not a validator'}`);
  }

  console.log('\n=== Batch Poster Status ===');
  console.log('  SequencerInbox:', sequencerInboxAddress);
  for (const addr of addressesToCheck) {
    const isBatchPoster = await publicClient.readContract({
      address: sequencerInboxAddress,
      abi: sequencerInboxAbi,
      functionName: 'isBatchPoster',
      args: [addr],
    });
    console.log(`  ${addr}: ${isBatchPoster ? 'BATCH POSTER' : 'not a batch poster'}`);
  }
}

main().catch(console.error);
