import 'dotenv/config';
import * as fs from 'fs';
import {
  createPublicClient,
  createWalletClient,
  http,
  Chain,
  encodeFunctionData,
  keccak256,
  toHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Manage governance roles on the UpgradeExecutor.
 *
 * Usage:
 *   npx tsx scripts/manage-governance.ts status
 *   npx tsx scripts/manage-governance.ts grant <address>
 *   npx tsx scripts/manage-governance.ts revoke <address>
 *
 * The deployer has EXECUTOR_ROLE by default. To transfer governance:
 *   1. Deploy a multisig (e.g. Gnosis Safe on Arbitrum Sepolia)
 *   2. Grant EXECUTOR_ROLE to the multisig: npm run gov grant <safe-address>
 *   3. Revoke deployer access: npm run gov revoke <deployer-address>
 */

const EXECUTOR_ROLE = keccak256(toHex('EXECUTOR_ROLE'));
const ADMIN_ROLE = keccak256(toHex('ADMIN_ROLE'));

const upgradeExecutorAbi = [
  {
    name: 'execute',
    type: 'function',
    stateMutability: 'payable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    name: 'hasRole',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'grantRole',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
  },
  {
    name: 'revokeRole',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'role', type: 'bytes32' },
      { name: 'account', type: 'address' },
    ],
    outputs: [],
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
  const command = process.argv[2] || 'status';
  const targetAddress = process.argv[3] as `0x${string}` | undefined;

  if (!fs.existsSync('deployment.json')) {
    console.error('Error: deployment.json not found. Run deploy:rollup first.');
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
  const upgradeExecutorAddress = deployment.coreContracts.upgradeExecutor as `0x${string}`;

  const publicClient = createPublicClient({
    chain: parentChain,
    transport: http(process.env.PARENT_CHAIN_RPC),
  });

  if (command === 'status') {
    console.log('=== Governance Status ===');
    console.log('UpgradeExecutor:', upgradeExecutorAddress);
    console.log('Deployer:', deployment.deployer);
    console.log('\nRole hashes:');
    console.log('  EXECUTOR_ROLE:', EXECUTOR_ROLE);
    console.log('  ADMIN_ROLE:', ADMIN_ROLE);

    const deployerHasExecutor = await publicClient.readContract({
      address: upgradeExecutorAddress,
      abi: upgradeExecutorAbi,
      functionName: 'hasRole',
      args: [EXECUTOR_ROLE, deployment.deployer as `0x${string}`],
    });

    const executorHasAdmin = await publicClient.readContract({
      address: upgradeExecutorAddress,
      abi: upgradeExecutorAbi,
      functionName: 'hasRole',
      args: [ADMIN_ROLE, upgradeExecutorAddress],
    });

    console.log('\nCurrent roles:');
    console.log(`  Deployer (${deployment.deployer}):`);
    console.log('    EXECUTOR_ROLE:', deployerHasExecutor);
    console.log(`  UpgradeExecutor (${upgradeExecutorAddress}):`);
    console.log('    ADMIN_ROLE:', executorHasAdmin);

    if (targetAddress) {
      const targetHasExecutor = await publicClient.readContract({
        address: upgradeExecutorAddress,
        abi: upgradeExecutorAbi,
        functionName: 'hasRole',
        args: [EXECUTOR_ROLE, targetAddress],
      });
      console.log(`  Target (${targetAddress}):`);
      console.log('    EXECUTOR_ROLE:', targetHasExecutor);
    }

    console.log('\nTo transfer governance to a multisig:');
    console.log('  npx tsx scripts/manage-governance.ts grant <multisig-address>');
    console.log('  npx tsx scripts/manage-governance.ts revoke <deployer-address>');
    return;
  }

  if (!targetAddress) {
    console.error('Error: target address required for grant/revoke');
    console.error('Usage: npx tsx scripts/manage-governance.ts grant|revoke <address>');
    process.exit(1);
  }

  const account = privateKeyToAccount(
    process.env.DEPLOYER_PRIVATE_KEY! as `0x${string}`
  );

  const walletClient = createWalletClient({
    account,
    chain: parentChain,
    transport: http(process.env.PARENT_CHAIN_RPC),
  });

  if (command === 'grant') {
    // Check if already has role
    const alreadyHas = await publicClient.readContract({
      address: upgradeExecutorAddress,
      abi: upgradeExecutorAbi,
      functionName: 'hasRole',
      args: [EXECUTOR_ROLE, targetAddress],
    });

    if (alreadyHas) {
      console.log(`${targetAddress} already has EXECUTOR_ROLE`);
      return;
    }

    // Encode grantRole call
    const grantRoleData = encodeFunctionData({
      abi: upgradeExecutorAbi,
      functionName: 'grantRole',
      args: [EXECUTOR_ROLE, targetAddress],
    });

    console.log(`Granting EXECUTOR_ROLE to ${targetAddress}...`);
    console.log('  Via UpgradeExecutor.execute()');

    const txHash = await walletClient.writeContract({
      address: upgradeExecutorAddress,
      abi: upgradeExecutorAbi,
      functionName: 'execute',
      args: [upgradeExecutorAddress, grantRoleData],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log('\nRole granted!');
    console.log('  Transaction:', receipt.transactionHash);
    console.log('  Status:', receipt.status);

    // Verify
    const hasRole = await publicClient.readContract({
      address: upgradeExecutorAddress,
      abi: upgradeExecutorAbi,
      functionName: 'hasRole',
      args: [EXECUTOR_ROLE, targetAddress],
    });
    console.log('  Verified:', hasRole);
  } else if (command === 'revoke') {
    // Check if has role
    const hasRole = await publicClient.readContract({
      address: upgradeExecutorAddress,
      abi: upgradeExecutorAbi,
      functionName: 'hasRole',
      args: [EXECUTOR_ROLE, targetAddress],
    });

    if (!hasRole) {
      console.log(`${targetAddress} does not have EXECUTOR_ROLE`);
      return;
    }

    if (targetAddress.toLowerCase() === account.address.toLowerCase()) {
      console.log('WARNING: You are revoking your own EXECUTOR_ROLE!');
      console.log('Make sure another address has EXECUTOR_ROLE before proceeding.');
      console.log('Set CONFIRM_REVOKE=true in env to proceed.');
      if (process.env.CONFIRM_REVOKE !== 'true') {
        process.exit(1);
      }
    }

    // Encode revokeRole call
    const revokeRoleData = encodeFunctionData({
      abi: upgradeExecutorAbi,
      functionName: 'revokeRole',
      args: [EXECUTOR_ROLE, targetAddress],
    });

    console.log(`Revoking EXECUTOR_ROLE from ${targetAddress}...`);
    console.log('  Via UpgradeExecutor.execute()');

    const txHash = await walletClient.writeContract({
      address: upgradeExecutorAddress,
      abi: upgradeExecutorAbi,
      functionName: 'execute',
      args: [upgradeExecutorAddress, revokeRoleData],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    console.log('\nRole revoked!');
    console.log('  Transaction:', receipt.transactionHash);
    console.log('  Status:', receipt.status);
  } else {
    console.error('Unknown command:', command);
    console.error('Usage: npx tsx scripts/manage-governance.ts status|grant|revoke [address]');
    process.exit(1);
  }
}

main().catch(console.error);
