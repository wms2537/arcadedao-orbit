import 'dotenv/config';
import * as fs from 'fs';
import {
  createPublicClient,
  createWalletClient,
  http,
  Chain,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

/**
 * Deploy the ARCADE ERC-20 token on Arbitrum Sepolia.
 *
 * This token will be used as the native gas token on the ArcadeDao L3.
 * Players pay transaction fees in ARCADE instead of ETH.
 */

// Minimal ERC-20 bytecode + constructor (name="Arcade", symbol="ARCADE", 18 decimals, premint to deployer)
// Using a simple OpenZeppelin-style ERC-20 with premint
const ERC20_ABI = [
  {
    type: 'constructor',
    inputs: [
      { name: 'name_', type: 'string' },
      { name: 'symbol_', type: 'string' },
      { name: 'initialSupply', type: 'uint256' },
    ],
  },
  {
    name: 'name',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'symbol',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    name: 'totalSupply',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
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

  const publicClient = createPublicClient({
    chain: parentChain,
    transport: http(process.env.PARENT_CHAIN_RPC),
  });

  const walletClient = createWalletClient({
    account,
    chain: parentChain,
    transport: http(process.env.PARENT_CHAIN_RPC),
  });

  console.log('Deploying ARCADE token on Arbitrum Sepolia...');
  console.log('  Deployer:', account.address);

  // For testnet, we deploy a simple ERC-20 with preminted supply.
  // In production, you'd use your actual game token contract.
  //
  // NOTE: You need to compile and deploy your own ERC-20 contract.
  // Options:
  //   1. Use Foundry: forge create src/ArcadeToken.sol:ArcadeToken --constructor-args "Arcade" "ARCADE" 1000000000000000000000000000
  //   2. Use Hardhat: npx hardhat run scripts/deploy-token.ts
  //   3. Deploy via Remix (https://remix.ethereum.org)
  //
  // A simple OpenZeppelin ERC-20:
  //
  //   // SPDX-License-Identifier: MIT
  //   pragma solidity ^0.8.20;
  //   import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
  //   contract ArcadeToken is ERC20 {
  //       constructor() ERC20("Arcade", "ARCADE") {
  //           _mint(msg.sender, 1_000_000_000 * 10**18);
  //       }
  //   }

  console.log('\n=== ARCADE Token Deployment ===');
  console.log('');
  console.log('Deploy your ARCADE ERC-20 using one of these methods:');
  console.log('');
  console.log('Option 1 - Foundry:');
  console.log('  forge create src/ArcadeToken.sol:ArcadeToken \\');
  console.log('    --rpc-url $PARENT_CHAIN_RPC \\');
  console.log('    --private-key $DEPLOYER_PRIVATE_KEY');
  console.log('');
  console.log('Option 2 - Copy this Solidity contract to Remix:');
  console.log('');
  console.log('  // SPDX-License-Identifier: MIT');
  console.log('  pragma solidity ^0.8.20;');
  console.log('  import "@openzeppelin/contracts/token/ERC20/ERC20.sol";');
  console.log('  contract ArcadeToken is ERC20 {');
  console.log('      constructor() ERC20("Arcade", "ARCADE") {');
  console.log('          _mint(msg.sender, 1_000_000_000 * 10**18);');
  console.log('      }');
  console.log('  }');
  console.log('');
  console.log('After deploying, set ARCADE_TOKEN_ADDRESS in .env');
  console.log('Then run: npm run deploy:rollup');
}

main().catch(console.error);
