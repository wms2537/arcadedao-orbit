import 'dotenv/config';
import * as fs from 'fs';
import { createPublicClient, http, Chain } from 'viem';
import { createTokenBridgeFetchTokenBridgeContracts } from '@arbitrum/chain-sdk';

const parentChain: Chain = {
  id: 421614,
  name: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [process.env.PARENT_CHAIN_RPC!] } },
};

async function main() {
  const deployment = JSON.parse(fs.readFileSync('deployment.json', 'utf-8'));
  const inboxAddress = deployment.coreContracts.inbox as `0x${string}`;

  const parentPublicClient = createPublicClient({
    chain: parentChain,
    transport: http(process.env.PARENT_CHAIN_RPC),
  });

  console.log('Fetching token bridge contracts...');
  console.log('  Inbox:', inboxAddress);

  const bridgeContracts = await createTokenBridgeFetchTokenBridgeContracts({
    inbox: inboxAddress,
    parentChainPublicClient: parentPublicClient,
  });

  console.log('\nParent chain contracts:');
  console.log(JSON.stringify(bridgeContracts.parentChainContracts, null, 2));
  console.log('\nOrbit chain contracts:');
  console.log(JSON.stringify(bridgeContracts.orbitChainContracts, null, 2));

  // Save to deployment.json
  deployment.tokenBridgeContracts = {
    parentChain: bridgeContracts.parentChainContracts,
    orbitChain: bridgeContracts.orbitChainContracts,
  };
  fs.writeFileSync('deployment.json', JSON.stringify(deployment, null, 2));
  console.log('\nSaved to deployment.json');
}

main().catch(console.error);
