import 'dotenv/config';
import * as fs from 'fs';
import {
  createPublicClient,
  createWalletClient,
  http,
  Chain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { createTokenBridge } from '@arbitrum/chain-sdk';

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
  // Read rollup address from deployment.json
  let rollupAddress: `0x${string}` = '0x0000000000000000000000000000000000000000' as `0x${string}`;
  let orbitChainId = CHAIN_ID;

  if (fs.existsSync('deployment.json')) {
    const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
    rollupAddress = deployment.coreContracts.rollup as `0x${string}`;
    orbitChainId = deployment.chainId ?? orbitChainId;
    console.log('Loaded deployment.json - rollup:', rollupAddress);
  } else {
    console.error('Error: deployment.json not found. Run deploy:rollup first.');
    process.exit(1);
  }

  const orbitChain: Chain = {
    id: orbitChainId,
    name: 'ArcadeDao',
    nativeCurrency: { name: 'Arcade', symbol: 'ARCADE', decimals: 18 },
    rpcUrls: {
      default: { http: [process.env.ORBIT_CHAIN_RPC!] },
    },
  };

  const account = privateKeyToAccount(
    process.env.DEPLOYER_PRIVATE_KEY! as `0x${string}`
  );

  const parentPublicClient = createPublicClient({
    chain: parentChain,
    transport: http(process.env.PARENT_CHAIN_RPC),
  });

  const parentWalletClient = createWalletClient({
    account,
    chain: parentChain,
    transport: http(process.env.PARENT_CHAIN_RPC),
  });

  const orbitPublicClient = createPublicClient({
    chain: orbitChain,
    transport: http(process.env.ORBIT_CHAIN_RPC),
  });

  // For custom gas token chains, approve the TokenBridgeCreator to spend ARCADE
  const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
  const nativeTokenAddress = deployment.coreContracts.nativeToken as `0x${string}` | undefined;

  if (nativeTokenAddress && nativeTokenAddress !== '0x0000000000000000000000000000000000000000') {
    // TokenBridgeCreator on Arbitrum Sepolia
    const tokenBridgeCreator = '0x56C486D3786fA26cc61473C499A36Eb9CC1FbD8E' as `0x${string}`;
    const maxUint256 = 2n ** 256n - 1n;

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

    console.log('Approving TokenBridgeCreator to spend ARCADE token...');
    const approveTx = await parentWalletClient.writeContract({
      address: nativeTokenAddress,
      abi: erc20Abi,
      functionName: 'approve',
      args: [tokenBridgeCreator, maxUint256],
    });
    const approveReceipt = await parentPublicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log('  Approved! Tx:', approveReceipt.transactionHash);
  }

  console.log('Deploying token bridge...');
  console.log('  Rollup address:', rollupAddress);

  const tokenBridgeResult = await createTokenBridge({
    rollupAddress,
    rollupOwner: account.address,
    parentChainPublicClient: parentPublicClient,
    orbitChainPublicClient: orbitPublicClient,
    account,
    parentChainWalletClient: parentWalletClient,
  });

  console.log('\nToken bridge deployed successfully!');
  console.log('\nParent chain contracts:');
  console.log('  Router:', tokenBridgeResult.parentChainContracts.router);
  console.log('  StandardGateway:', tokenBridgeResult.parentChainContracts.standardGateway);
  console.log('\nOrbit chain contracts:');
  console.log('  Router:', tokenBridgeResult.orbitChainContracts.router);
  console.log('  StandardGateway:', tokenBridgeResult.orbitChainContracts.standardGateway);

  // Update deployment.json
  const updatedDeployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
  updatedDeployment.tokenBridgeContracts = {
    parentChain: tokenBridgeResult.parentChainContracts,
    orbitChain: tokenBridgeResult.orbitChainContracts,
  };
  fs.writeFileSync('deployment.json', JSON.stringify(updatedDeployment, null, 2));
  console.log('\nUpdated deployment.json with token bridge contracts');
}

main().catch(console.error);
