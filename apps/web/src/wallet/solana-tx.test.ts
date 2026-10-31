import { Keypair, PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import { base58Decode, base58Encode, transferTx } from './solana-tx';

describe('a SOL transfer, built by hand', () => {
  it('encodes and decodes base58 like Solana does', () => {
    for (let i = 0; i < 20; i++) {
      const pk = Keypair.generate().publicKey;
      expect(base58Encode(pk.toBytes())).toBe(pk.toBase58());
      expect(Array.from(base58Decode(pk.toBase58()))).toEqual(Array.from(pk.toBytes()));
    }
    expect(base58Encode(new Uint8Array([0, 0, 1]))).toBe('112');
    expect(Array.from(base58Decode('112'))).toEqual([0, 0, 1]);
    expect(Array.from(base58Decode('11111111111111111111111111111111'))).toEqual(new Array(32).fill(0));
    expect(() => base58Decode('0OIl')).toThrow();
  });

  it('serializes to exactly the bytes @solana/web3.js makes for the same transfer', () => {
    for (const lamports of [1n, 98_400_000n, 150_000_000n, 18_446_744_073_709_551_615n]) {
      const from = Keypair.generate().publicKey;
      const to = Keypair.generate().publicKey;
      const blockhash = Keypair.generate().publicKey.toBase58();
      const tx = new Transaction({ feePayer: from, recentBlockhash: blockhash }).add(
        SystemProgram.transfer({ fromPubkey: from, toPubkey: to, lamports }),
      );
      const theirs = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      const ours = transferTx(from.toBase58(), to.toBase58(), lamports, blockhash);
      expect(Buffer.from(ours).toString('hex')).toBe(Buffer.from(theirs).toString('hex'));
    }
  });

  it('refuses a zero amount, the same sender and receiver, and bad keys', () => {
    const a = Keypair.generate().publicKey.toBase58();
    const b = Keypair.generate().publicKey.toBase58();
    expect(() => transferTx(a, b, 0n, a)).toThrow('bad amount');
    expect(() => transferTx(a, a, 1n, b)).toThrow('same');
    expect(() => transferTx(a, 'short', 1n, b)).toThrow();
    expect(new PublicKey(a).toBase58()).toBe(a);
  });
});
