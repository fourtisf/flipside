/**
 * The two keys that sign for Hyperliquid:
 *
 * - The connected wallet signs the account actions (approve the trading key, approve the builder fee, move
 *   USDC between spot and perps, send to Solana). Each one opens the wallet, with the wallet's own chain as the
 *   signature chain, as Hyperliquid's EIP-712 user-signed actions expect.
 * - A trading key ("agent wallet" in Hyperliquid's words), made in this browser and approved once by the
 *   wallet, signs orders, cancels and leverage changes without a pop-up each time. Hyperliquid never lets an
 *   agent withdraw or transfer funds, so the worst a stolen trading key can do is trade.
 */
import type { AbstractViemJsonRpcAccount } from '@nktkas/hyperliquid/signing';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { Address, Eip1193 } from '@/wallet/store';

const EIP712_DOMAIN = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' },
];

/** What eth_signTypedData_v4 takes: the EIP-712 payload as JSON, with the domain type spelled out. */
export function typedDataJson(p: {
  domain: Record<string, unknown>;
  types: Record<string, readonly { name: string; type: string }[]>;
  primaryType: string;
  message: Record<string, unknown>;
}): string {
  return JSON.stringify(
    {
      domain: p.domain,
      types: { EIP712Domain: EIP712_DOMAIN, ...p.types },
      primaryType: p.primaryType,
      message: p.message,
    },
    // uint64 values (nonces, times) may arrive as bigint
    (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v),
  );
}

/** The connected wallet as a signer the Hyperliquid SDK accepts. */
export function walletSigner(provider: Eip1193, address: Address): AbstractViemJsonRpcAccount {
  return {
    signTypedData: async (params) =>
      (await provider.request({
        method: 'eth_signTypedData_v4',
        params: [address, typedDataJson(params)],
      })) as `0x${string}`,
    getAddresses: async () => [address],
    getChainId: async () => Number.parseInt(String(await provider.request({ method: 'eth_chainId' })), 16),
  };
}

export interface Agent {
  key: `0x${string}`;
  address: Address;
  /** The builder fee this wallet has approved, if any ("0.05%"). */
  builderFee?: string;
}

const KEY = (owner: string) => `coinside.agent.${owner.toLowerCase()}`;

export function newAgent(): Agent {
  const key = generatePrivateKey();
  return { key, address: privateKeyToAccount(key).address.toLowerCase() as Address };
}

export function loadAgent(owner: string): Agent | null {
  try {
    const a = JSON.parse(localStorage.getItem(KEY(owner)) ?? 'null') as Agent | null;
    return a && /^0x[0-9a-f]{64}$/i.test(a.key) && /^0x[0-9a-f]{40}$/i.test(a.address) ? a : null;
  } catch {
    return null;
  }
}

export function saveAgent(owner: string, a: Agent) {
  try {
    localStorage.setItem(KEY(owner), JSON.stringify(a));
  } catch {
    // private mode: trading works for this visit, and asks again next time
  }
}

export function forgetAgent(owner: string) {
  try {
    localStorage.removeItem(KEY(owner));
  } catch {
    // nothing stored
  }
}

/** The trading key as a signer the SDK accepts. */
export const agentSigner = (a: Agent) => privateKeyToAccount(a.key);
