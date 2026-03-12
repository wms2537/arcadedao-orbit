import 'dotenv/config';
import * as fs from 'fs';
import {
  createPublicClient,
  createWalletClient,
  http,
  maxUint256,
  Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  prepareChainConfig,
  createRollup,
  createRollupPrepareDeploymentParamsConfig,
} from '@arbitrum/chain-sdk';

/**
 * ArcadeDao — Deploy Orbit AnyTrust L3 on Arbitrum Sepolia
 *
 * Uses v3.1 RollupCreator with BoLD challenge protocol.
 * Configured with ARCADE as native gas token.
 */

const CHAIN_ID = Number(process.env.CHAIN_ID || 942070);

const parentChain: Chain = {
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.PARENT_CHAIN_RPC!] },
  },
};

async function main() {
  const account = privateKeyToAccount(
    process.env.DEPLOYER_PRIVATE_KEY! as `0x${string}`
  );

  const parentChainPublicClient = createPublicClient({
    chain: parentChain,
    transport: http(process.env.PARENT_CHAIN_RPC),
  });

  const parentWalletClient = createWalletClient({
    account,
    chain: parentChain,
    transport: http(process.env.PARENT_CHAIN_RPC),
  });

  // Check for ARCADE token address (custom gas token)
  const arcadeTokenAddress = process.env.ARCADE_TOKEN_ADDRESS as `0x${string}` | undefined;
  const useCustomGasToken = !!arcadeTokenAddress && arcadeTokenAddress.length > 10;

  // Build chain config
  const chainConfig = prepareChainConfig({
    chainId: CHAIN_ID,
    arbitrum: {
      InitialChainOwner: account.address,
      DataAvailabilityCommittee: true, // AnyTrust mode
      ...(useCustomGasToken && {
        NativeToken: arcadeTokenAddress,
      }),
    },
  });

  console.log('Deploying ArcadeDao Orbit chain...');
  console.log('  Version: v3.1 (BoLD challenge protocol)');
  console.log('  Chain ID:', CHAIN_ID);
  console.log('  AnyTrust: true');
  console.log('  Gas Token:', useCustomGasToken ? `ARCADE (${arcadeTokenAddress})` : 'ETH');
  console.log('  Deployer:', account.address);

  // If using custom gas token, approve the RollupCreator to spend it
  if (useCustomGasToken) {
    console.log('\nApproving RollupCreator to spend ARCADE tokens...');
    const erc20Abi = [
      {
        name: 'approve',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'spender', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
      },
    ] as const;

    // v3.1 RollupCreator on Arbitrum Sepolia
    const rollupCreatorAddress = '0x5F45675AC8DDF7d45713b2c7D191B287475C16cF' as `0x${string}`;

    const approveTx = await parentWalletClient.writeContract({
      address: arcadeTokenAddress!,
      abi: erc20Abi,
      functionName: 'approve',
      args: [rollupCreatorAddress, maxUint256],
    });

    const approveReceipt = await parentChainPublicClient.waitForTransactionReceipt({
      hash: approveTx,
    });
    console.log('  Approved! Tx:', approveReceipt.transactionHash);
  }

  // Deploy rollup
  const deployResult = await createRollup({
    params: {
      config: createRollupPrepareDeploymentParamsConfig(parentChainPublicClient, {
        chainId: BigInt(CHAIN_ID),
        owner: account.address,
        chainConfig,
      }),
      validators: [account.address] as `0x${string}`[],
      batchPosters: [account.address] as `0x${string}`[],
      batchPosterManager: account.address,
      deployFactoriesToL2: true,
      ...(useCustomGasToken && {
        nativeToken: arcadeTokenAddress,
      }),
    },
    account,
    parentChainPublicClient,
    rollupCreatorVersion: 'v3.1',
  });

  console.log('\nRollup deployed successfully!');
  console.log('Transaction hash:', deployResult.transactionHash);
  console.log('\nCore contracts:');
  console.log('  Rollup:', deployResult.coreContracts.rollup);
  console.log('  Inbox:', deployResult.coreContracts.inbox);
  console.log('  Outbox:', deployResult.coreContracts.outbox);
  console.log('  Bridge:', deployResult.coreContracts.bridge);
  console.log('  SequencerInbox:', deployResult.coreContracts.sequencerInbox);
  console.log('  RollupEventInbox:', deployResult.coreContracts.rollupEventInbox);
  console.log('  UpgradeExecutor:', deployResult.coreContracts.upgradeExecutor);

  // Save deployment output
  const deployment: Record<string, unknown> = {
    chainId: CHAIN_ID,
    chainName: 'ArcadeDao',
    parentChainId: 421614,
    rollupVersion: 'v3.1',
    isAnyTrust: true,
    gasToken: useCustomGasToken ? arcadeTokenAddress : 'ETH',
    transactionHash: deployResult.transactionHash,
    chainConfig,
    coreContracts: deployResult.coreContracts,
    deployer: account.address,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync('deployment.json', JSON.stringify(deployment, null, 2));
  console.log('\nDeployment saved to deployment.json');

  // Fetch deployment block number
  if (deployResult.transactionHash) {
    try {
      const receipt = await parentChainPublicClient.getTransactionReceipt({
        hash: deployResult.transactionHash,
      });
      deployment.deployedAtBlock = Number(receipt.blockNumber);
      fs.writeFileSync('deployment.json', JSON.stringify(deployment, null, 2));
      console.log('  Deployed at block:', deployment.deployedAtBlock);
    } catch (err) {
      console.warn('  Could not fetch receipt:', (err as Error).message);
    }
  }
}

main().catch(console.error);
