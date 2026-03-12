import 'dotenv/config';
import * as fs from 'fs';
import {
  createPublicClient,
  createWalletClient,
  http,
  Chain,
  formatEther,
  parseEther,
  encodeFunctionData,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const CHAIN_ID = Number(process.env.CHAIN_ID || 942070);

const parentChain: Chain = {
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.PARENT_CHAIN_RPC!] } },
};

const orbitChain: Chain = {
  id: CHAIN_ID,
  name: 'ArcadeDao',
  nativeCurrency: { name: 'Arcade', symbol: 'ARCADE', decimals: 18 },
  rpcUrls: { default: { http: [process.env.ORBIT_CHAIN_RPC!] } },
};

async function main() {
  const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
  const account = privateKeyToAccount(process.env.DEPLOYER_PRIVATE_KEY! as `0x${string}`);

  const parentPublic = createPublicClient({ chain: parentChain, transport: http(process.env.PARENT_CHAIN_RPC) });
  const parentWallet = createWalletClient({ account, chain: parentChain, transport: http(process.env.PARENT_CHAIN_RPC) });
  const orbitPublic = createPublicClient({ chain: orbitChain, transport: http(process.env.ORBIT_CHAIN_RPC) });
  const orbitWallet = createWalletClient({ account, chain: orbitChain, transport: http(process.env.ORBIT_CHAIN_RPC) });

  const command = process.argv[2] || 'status';

  // ─── STATUS ───
  if (command === 'status') {
    console.log('=== ArcadeDao L3 Status ===\n');

    const blockNumber = await orbitPublic.getBlockNumber();
    console.log('L3 Block Number:', blockNumber.toString());

    const l3Balance = await orbitPublic.getBalance({ address: account.address });
    console.log('Deployer L3 balance:', formatEther(l3Balance), 'ARCADE');

    // Check ARCADE ERC-20 balance on parent chain
    const arcadeToken = deployment.gasToken as `0x${string}`;
    const erc20Abi = [{ name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }] as const;
    const parentArcadeBalance = await parentPublic.readContract({
      address: arcadeToken,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [account.address],
    });
    console.log('Deployer parent ARCADE:', formatEther(parentArcadeBalance), 'ARCADE');

    const parentEthBalance = await parentPublic.getBalance({ address: account.address });
    console.log('Deployer parent ETH:', formatEther(parentEthBalance), 'ETH');

    console.log('\nAddresses:');
    console.log('  Deployer:', account.address);
    console.log('  Inbox:', deployment.coreContracts.inbox);
    console.log('  Bridge:', deployment.coreContracts.bridge);
    return;
  }

  // ─── DEPOSIT: Bridge ARCADE from parent chain to L3 ───
  if (command === 'deposit') {
    const amount = parseEther(process.argv[3] || '10');
    const inboxAddress = deployment.coreContracts.inbox as `0x${string}`;
    const arcadeToken = deployment.gasToken as `0x${string}`;

    console.log(`=== Depositing ${formatEther(amount)} ARCADE to L3 ===\n`);

    // Step 1: Approve the Inbox to spend ARCADE (Inbox calls transferFrom)
    const erc20Abi = [
      { name: 'approve', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
      { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
    ] as const;

    const currentAllowance = await parentPublic.readContract({
      address: arcadeToken,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [account.address, inboxAddress],
    });

    if (currentAllowance < amount) {
      console.log('Approving Inbox to spend ARCADE...');
      const approveTx = await parentWallet.writeContract({
        address: arcadeToken,
        abi: erc20Abi,
        functionName: 'approve',
        args: [inboxAddress, amount * 10n], // approve extra for future deposits
      });
      const approveReceipt = await parentPublic.waitForTransactionReceipt({ hash: approveTx });
      console.log('  Approved! Tx:', approveReceipt.transactionHash);
    } else {
      console.log('Inbox already approved for', formatEther(currentAllowance), 'ARCADE');
    }

    // Step 2: Call Inbox.depositERC20 to bridge ARCADE
    // For custom gas token chains, use depositERC20(uint256 amount) on the Inbox
    const inboxAbi = [
      {
        name: 'depositERC20',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'amount', type: 'uint256' }],
        outputs: [],
      },
    ] as const;

    console.log('Depositing via Inbox.depositERC20...');
    const depositTx = await parentWallet.writeContract({
      address: inboxAddress,
      abi: inboxAbi,
      functionName: 'depositERC20',
      args: [amount],
    });
    const depositReceipt = await parentPublic.waitForTransactionReceipt({ hash: depositTx });
    console.log('  Deposit tx:', depositReceipt.transactionHash);
    console.log('  Status:', depositReceipt.status);
    console.log('\nDeposit submitted! Funds should arrive on L3 after ~15 minutes.');
    console.log('Check with: npx tsx scripts/test-transactions.ts status');
    return;
  }

  // ─── TRANSFER: Send ARCADE on L3 ───
  if (command === 'transfer') {
    const to = (process.argv[3] || '0x000000000000000000000000000000000000dEaD') as `0x${string}`;
    const amount = parseEther(process.argv[4] || '0.001');

    const balance = await orbitPublic.getBalance({ address: account.address });
    console.log(`=== L3 Transfer ===\n`);
    console.log('Balance:', formatEther(balance), 'ARCADE');

    if (balance < amount) {
      console.error(`Insufficient balance. Have ${formatEther(balance)}, need ${formatEther(amount)}`);
      console.error('Deposit ARCADE first: npx tsx scripts/test-transactions.ts deposit 10');
      process.exit(1);
    }

    console.log(`Sending ${formatEther(amount)} ARCADE to ${to}...`);
    const txHash = await orbitWallet.sendTransaction({
      to,
      value: amount,
    });
    const receipt = await orbitPublic.waitForTransactionReceipt({ hash: txHash });
    console.log('\nTransfer complete!');
    console.log('  Tx:', receipt.transactionHash);
    console.log('  Block:', receipt.blockNumber.toString());
    console.log('  Gas used:', receipt.gasUsed.toString());
    console.log('  Status:', receipt.status);

    const newBalance = await orbitPublic.getBalance({ address: account.address });
    console.log('  New balance:', formatEther(newBalance), 'ARCADE');
    return;
  }

  // ─── DEPLOY: Deploy a simple counter contract on L3 ───
  if (command === 'deploy-counter') {
    console.log('=== Deploying Counter Contract on L3 ===\n');

    const balance = await orbitPublic.getBalance({ address: account.address });
    console.log('Balance:', formatEther(balance), 'ARCADE');

    if (balance < parseEther('0.001')) {
      console.error('Insufficient balance for deployment.');
      console.error('Deposit ARCADE first: npx tsx scripts/test-transactions.ts deposit 10');
      process.exit(1);
    }

    // Simple counter contract bytecode (Solidity compiled)
    // contract Counter { uint256 public count; function increment() public { count++; } }
    const counterBytecode = '0x6080604052348015600e575f5ffd5b506101438061001c5f395ff3fe6080604052348015600e575f5ffd5b5060043610603a575f3560e01c806306661abd14603e578063d09de08a146057575b5f5ffd5b60456069565b60405190815260200160405180910390f35b605d605f565b005b600180545f8082558082558181555050565b5f5481565bfea264697066735822122000000000000000000000000000000000000000000000000000000000000000006c6578706572696d656e74616c0033' as `0x${string}`;

    // Deploy a minimal counter using raw bytecode
    // Simpler approach: deploy inline via CREATE opcode
    // Counter: stores a uint256, has increment() and count()
    const minimalCounter = '0x608060405234801561001057600080fd5b5060f78061001f6000396000f3fe6080604052348015600f57600080fd5b5060043610603c5760003560e01c806306661abd1460415780631003e2d21460575780636d4ce63c14606f575b600080fd5b60005460405190815260200160405180910390f35b6067600480360381019060639190608f565b6079565b005b60005460405190815260200160405180910390f35b8060008082825460899190609f565b92505081905550565b60008135905060898160de565b92915050565b60006020828403121560a457600080fd5b600060b084828501607e565b91505092915050565b600060b98260d4565b915060c28360d4565b925082820190508082111560d65760d560d8565b5b92915050565bfe5b6000819050919050565b5f8190509190505600fea164736f6c6343000819000a' as `0x${string}`;

    console.log('Deploying counter contract...');
    const txHash = await orbitWallet.sendTransaction({
      data: minimalCounter,
    });
    const receipt = await orbitPublic.waitForTransactionReceipt({ hash: txHash });

    if (receipt.contractAddress) {
      console.log('\nCounter deployed!');
      console.log('  Contract:', receipt.contractAddress);
      console.log('  Tx:', receipt.transactionHash);
      console.log('  Block:', receipt.blockNumber.toString());
      console.log('  Gas used:', receipt.gasUsed.toString());

      // Try calling count()
      try {
        const countResult = await orbitPublic.call({
          to: receipt.contractAddress,
          data: '0x06661abd', // count() selector
        });
        console.log('  Initial count:', parseInt(countResult.data || '0x0', 16));
      } catch {
        console.log('  (Could not read initial count)');
      }
    } else {
      console.log('\nDeployment tx sent but no contract address in receipt');
      console.log('  Tx:', receipt.transactionHash);
      console.log('  Status:', receipt.status);
    }
    return;
  }

  console.log('Usage: npx tsx scripts/test-transactions.ts <command>');
  console.log('');
  console.log('Commands:');
  console.log('  status          Show chain status and balances');
  console.log('  deposit [amt]   Bridge ARCADE from parent chain to L3 (default: 10)');
  console.log('  transfer [to] [amt]  Send ARCADE on L3 (default: 0.001 to burn address)');
  console.log('  deploy-counter  Deploy a simple counter contract on L3');
}

main().catch(console.error);
