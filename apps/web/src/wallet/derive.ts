/**
 * A Hyperliquid account for a Solana wallet, with no 0x wallet involved (ALFA, 31 Oct 2026: "Solana saja").
 *
 * Hyperliquid only accepts secp256k1 (0x-style) signatures; Solana wallets sign with ed25519. So the person's
 * Solana wallet signs one fixed message, and the account key is derived from that signature in the browser:
 * key = keccak256(tag || signature), re-hashed in the (vanishingly rare) case it isn't a valid secp256k1 key.
 * Ed25519 signatures are deterministic (RFC 8032), so the same wallet signing the same message always yields the
 * same key, on any device, and Coinside never stores or sees it. The same pattern dYdX used for its STARK keys.
 *
 * Guards, because this key controls the account and its funds:
 * - the signature is verified against the Solana address before anything is derived from it;
 * - the first time, the wallet signs twice and both must match (a wallet that doesn't sign deterministically
 *   would otherwise create a different account each time);
 * - the message says plainly to sign it only on coinside.fun, since anyone holding this signature holds the key.
 */
import { ed25519 } from '@noble/curves/ed25519';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex } from '@noble/hashes/utils';
import { privateKeyToAccount } from 'viem/accounts';
import type { Address } from './store';
import { base58Decode } from './solana-tx';

export const SIGN_IN_MESSAGE = [
  'Coinside: open my trading account',
  '',
  'Sign this only on https://coinside.fun.',
  'This signature is the key to your Coinside account on Hyperliquid. Anyone who has it controls that account,',
  'so never sign this message anywhere else.',
  '',
  'Version: 1',
].join('\n');

export const signInBytes = () => new TextEncoder().encode(SIGN_IN_MESSAGE);

const TAG = new TextEncoder().encode('coinside.fun/hyperliquid-key/v1');

/** The signature is the Solana address's own, over exactly the sign-in message. */
export function verifySignIn(solAddress: string, signature: Uint8Array): boolean {
  try {
    return signature.length === 64 && ed25519.verify(signature, signInBytes(), base58Decode(solAddress));
  } catch {
    return false;
  }
}

/** The account key derived from the sign-in signature. */
export function deriveKey(signature: Uint8Array): `0x${string}` {
  let h = keccak_256(Uint8Array.from([...TAG, ...signature]));
  while (!secp256k1.utils.isValidPrivateKey(h)) h = keccak_256(h);
  return `0x${bytesToHex(h)}`;
}

/** The Hyperliquid address of a derived key, lowercase like the rest of the app. */
export const keyAddress = (key: `0x${string}`) => privateKeyToAccount(key).address.toLowerCase() as Address;

/** Why a sign-in signature can't be used, or null when it can. */
export function signInProblem(solAddress: string, first: Uint8Array, second?: Uint8Array): string | null {
  if (!verifySignIn(solAddress, first))
    return "That signature doesn't match your Solana address. Your wallet may not support signing messages (a Ledger, for example).";
  if (second && (second.length !== first.length || second.some((b, i) => b !== first[i])))
    return "Your wallet signed the same message two different ways, so it can't hold a Coinside account safely. Try Phantom, Backpack or Solflare.";
  return null;
}
