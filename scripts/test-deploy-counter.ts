import 'dotenv/config';
import * as fs from 'fs';
import { createPublicClient, createWalletClient, http, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const orbitChain = {
  id: Number(process.env.CHAIN_ID || 942070),
  name: 'ArcadeDao',
  nativeCurrency: { name: 'Arcade', symbol: 'ARCADE', decimals: 18 },
  rpcUrls: { default: { http: [process.env.ORBIT_CHAIN_RPC!] } },
};

async function main() {
  const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY! as `0x${string}`);
  const orbitPublic = createPublicClient({ chain: orbitChain, transport: http(process.env.ORBIT_CHAIN_RPC) });
  const orbitWallet = createWalletClient({ account, chain: orbitChain, transport: http(process.env.ORBIT_CHAIN_RPC) });

  // Read compiled bytecode
  const artifact = JSON.parse(fs.readFileSync('contracts/out/Counter.sol/Counter.json', 'utf-8'));
  const bytecode = artifact.bytecode.object as `0x${string}`;

  console.log('=== Deploying Counter on ArcadeDao L3 ===\n');

  const txHash = await orbitWallet.sendTransaction({ data: bytecode });
  const receipt = await orbitPublic.waitForTransactionReceipt({ hash: txHash });

  console.log('Counter deployed!');
  console.log('  Contract:', receipt.contractAddress);
  console.log('  Tx:', receipt.transactionHash);
  console.log('  Block:', receipt.blockNumber.toString());
  console.log('  Gas used:', receipt.gasUsed.toString());

  if (!receipt.contractAddress) return;

  const counterAbi = [
    { name: 'count', type: 'function', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
    { name: 'increment', type: 'function', stateMutability: 'nonpayable', inputs: [], outputs: [] },
    { name: 'add', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'amount', type: 'uint256' }], outputs: [] },
  ] as const;

  // Read initial count
  const count0 = await orbitPublic.readContract({ address: receipt.contractAddress, abi: counterAbi, functionName: 'count' });
  console.log('\n  count() =', count0.toString());

  // Increment
  console.log('  Calling increment()...');
  const incTx = await orbitWallet.writeContract({ address: receipt.contractAddress, abi: counterAbi, functionName: 'increment' });
  const incReceipt = await orbitPublic.waitForTransactionReceipt({ hash: incTx });
  console.log('  increment() tx:', incReceipt.transactionHash, '| gas:', incReceipt.gasUsed.toString());

  const count1 = await orbitPublic.readContract({ address: receipt.contractAddress, abi: counterAbi, functionName: 'count' });
  console.log('  count() =', count1.toString());

  // Add 42
  console.log('  Calling add(42)...');
  const addTx = await orbitWallet.writeContract({ address: receipt.contractAddress, abi: counterAbi, functionName: 'add', args: [42n] });
  const addReceipt = await orbitPublic.waitForTransactionReceipt({ hash: addTx });
  console.log('  add(42) tx:', addReceipt.transactionHash, '| gas:', addReceipt.gasUsed.toString());

  const count2 = await orbitPublic.readContract({ address: receipt.contractAddress, abi: counterAbi, functionName: 'count' });
  console.log('  count() =', count2.toString());

  const finalBalance = await orbitPublic.getBalance({ address: account.address });
  console.log('\n  Final balance:', formatEther(finalBalance), 'ARCADE');
}

main().catch(console.error);
