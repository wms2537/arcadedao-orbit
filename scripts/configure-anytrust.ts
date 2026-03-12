import 'dotenv/config';
import * as fs from 'fs';
import {
  createPublicClient,
  createWalletClient,
  http,
  Chain,
  keccak256,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  prepareKeyset,
  buildSetValidKeyset,
  isValidKeysetHash,
} from '@arbitrum/chain-sdk';

/**
 * Configure AnyTrust DAC keyset on the SequencerInbox.
 *
 * Prerequisites:
 *   1. Deploy rollup (deploy-rollup.ts) — creates deployment.json
 *   2. Generate BLS keys for each DAC member:
 *      docker run --rm --entrypoint /usr/local/bin/datool \
 *        -v $(pwd)/das-keys:/keys \
 *        offchainlabs/nitro-node:v3.9.4-7f582c3 keygen --dir /keys
 */

const parentChain: Chain = {
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.PARENT_CHAIN_RPC!] },
  },
};

async function main() {
  // Load deployment
  if (!fs.existsSync('deployment.json')) {
    console.error('Error: deployment.json not found. Run deploy:rollup first.');
    process.exit(1);
  }
  const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
  const sequencerInboxAddress = deployment.coreContracts.sequencerInbox as `0x${string}`;
  const upgradeExecutorAddress = deployment.coreContracts.upgradeExecutor as `0x${string}`;

  console.log('SequencerInbox:', sequencerInboxAddress);
  console.log('UpgradeExecutor:', upgradeExecutorAddress);

  // Read BLS public keys from das-keys directory
  const dasKeyPath = 'das-keys/das_bls.pub';
  if (!fs.existsSync(dasKeyPath)) {
    console.error('\nError: BLS public key not found at', dasKeyPath);
    console.error('Generate keys first:');
    console.error('  docker run --rm --entrypoint /usr/local/bin/datool \\');
    console.error('    -v $(pwd)/das-keys:/keys \\');
    console.error('    offchainlabs/nitro-node:v3.9.4-7f582c3 keygen --dir /keys');
    process.exit(1);
  }

  const blsPubKeyBase64 = fs.readFileSync(dasKeyPath, 'utf-8').trim();
  console.log('\nBLS public key (base64, first 60 chars):', blsPubKeyBase64.substring(0, 60) + '...');

  // For a single-member DAC, assumedHonest = 1
  const assumedHonest = 1;
  const publicKeys = [blsPubKeyBase64];

  // Encode keyset bytes using SDK helper
  const keysetBytes = prepareKeyset(publicKeys, assumedHonest);
  const keysetHash = keccak256(keysetBytes);
  console.log('\nKeyset bytes length:', (keysetBytes.length - 2) / 2, 'bytes');
  console.log('Keyset hash:', keysetHash);

  const account = privateKeyToAccount(
    process.env.DEPLOYER_PRIVATE_KEY! as `0x${string}`
  );

  const publicClient = createPublicClient({
    chain: parentChain,
    transport: http(process.env.PARENT_CHAIN_RPC),
  });

  const walletClient = createWalletClient({
    account,
    chain: parentChain,
    transport: http(process.env.PARENT_CHAIN_RPC),
  });

  // Check if keyset is already registered
  try {
    const alreadyValid = await isValidKeysetHash(publicClient, {
      sequencerInbox: sequencerInboxAddress,
      params: { keysetHash },
    });
    if (alreadyValid) {
      console.log('\nKeyset is already registered and valid!');
      return;
    }
  } catch {
    // isValidKeysetHash may not exist on older versions, continue
  }

  // Build the setValidKeyset transaction through UpgradeExecutor
  console.log('\nRegistering keyset on SequencerInbox via UpgradeExecutor...');
  const txRequest = await buildSetValidKeyset(publicClient, {
    account: account.address,
    upgradeExecutor: upgradeExecutorAddress,
    sequencerInbox: sequencerInboxAddress,
    params: { keyset: keysetBytes },
  });

  const txHash = await walletClient.sendTransaction({
    ...txRequest,
    account,
    chain: parentChain,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log('\nKeyset registered successfully!');
  console.log('  Transaction:', receipt.transactionHash);
  console.log('  Status:', receipt.status);
  console.log('  Keyset hash:', keysetHash);

  // Verify registration
  try {
    const isValid = await isValidKeysetHash(publicClient, {
      sequencerInbox: sequencerInboxAddress,
      params: { keysetHash },
    });
    console.log('  Verified:', isValid);
  } catch {
    // verification is optional
  }

  // Save keyset info to deployment.json
  deployment.dacKeyset = {
    keysetHash,
    assumedHonest,
    members: 1,
    registeredAt: new Date().toISOString(),
  };
  fs.writeFileSync('deployment.json', JSON.stringify(deployment, null, 2));
  console.log('\nUpdated deployment.json with DAC keyset info');
}

main().catch(console.error);
