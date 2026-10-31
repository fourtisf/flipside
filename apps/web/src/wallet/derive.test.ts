import { ed25519 } from '@noble/curves/ed25519';
import { secp256k1 } from '@noble/curves/secp256k1';
import { describe, expect, it } from 'vitest';
import { deriveKey, keyAddress, SIGN_IN_MESSAGE, signInBytes, signInProblem, verifySignIn } from './derive';
import { base58Encode } from './solana-tx';

const seed = new Uint8Array(32).fill(7);
const address = base58Encode(ed25519.getPublicKey(seed));
const sign = (msg: Uint8Array, s = seed) => ed25519.sign(msg, s);

describe('a Hyperliquid account from a Solana signature', () => {
  it('asks the wallet to sign a message that says where to sign it and why it matters', () => {
    expect(SIGN_IN_MESSAGE).toContain('https://coinside.fun');
    expect(SIGN_IN_MESSAGE).toContain('never sign this message anywhere else');
  });

  it('derives the same valid key every time from the same wallet, and a different one per wallet', () => {
    const sig = sign(signInBytes());
    // ed25519 is deterministic: signing again gives the same bytes, so the same key
    expect(Array.from(sign(signInBytes()))).toEqual(Array.from(sig));
    const key = deriveKey(sig);
    expect(key).toMatch(/^0x[0-9a-f]{64}$/);
    expect(secp256k1.utils.isValidPrivateKey(key.slice(2))).toBe(true);
    expect(deriveKey(sig)).toBe(key);
    expect(keyAddress(key)).toMatch(/^0x[0-9a-f]{40}$/);
    const other = sign(signInBytes(), new Uint8Array(32).fill(8));
    expect(deriveKey(other)).not.toBe(key);
  });

  it('only accepts the address own signature over exactly this message', () => {
    const sig = sign(signInBytes());
    expect(verifySignIn(address, sig)).toBe(true);
    expect(verifySignIn(address, sign(new TextEncoder().encode('something else')))).toBe(false);
    expect(verifySignIn(address, sign(signInBytes(), new Uint8Array(32).fill(9)))).toBe(false);
    expect(verifySignIn('not-an-address', sig)).toBe(false);
    expect(verifySignIn(address, sig.slice(0, 63))).toBe(false);
  });

  it('says plainly when a signature is wrong or the wallet does not sign the same way twice', () => {
    const sig = sign(signInBytes());
    expect(signInProblem(address, sig, sig)).toBeNull();
    expect(signInProblem(address, sig)).toBeNull();
    const flipped = Uint8Array.from(sig);
    flipped[0] = flipped[0]! ^ 1;
    expect(signInProblem(address, flipped)).toMatch(/doesn't match your Solana address/);
    expect(signInProblem(address, sig, flipped)).toMatch(/two different ways/);
  });
});
