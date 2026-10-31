/**
 * A plain SOL transfer as the bytes a Solana wallet signs and sends (the Wallet Standard's
 * `solana:signAndSendTransaction` takes a serialized transaction). Built by hand so the app doesn't ship
 * @solana/web3.js for one instruction; the tests check every byte against web3.js.
 *
 * Wire format (a legacy transaction): one empty signature slot, then the message: header [1 signer, 0 read-only
 * signers, 1 read-only account], the account keys [sender, receiver, System Program], the recent blockhash, and
 * one System Program instruction: Transfer (index 2, u32 little-endian) of `lamports` (u64 little-endian).
 */

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Decode(s: string): Uint8Array {
  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros++;
  const bytes: number[] = []; // little-endian while building
  for (const ch of s.slice(zeros)) {
    let carry = ALPHABET.indexOf(ch);
    if (carry < 0) throw new Error('not base58');
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i]! * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  return Uint8Array.from([...new Array<number>(zeros).fill(0), ...bytes.reverse()]);
}

export function base58Encode(bytes: Uint8Array): string {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = []; // little-endian while building
  for (const b of bytes.slice(zeros)) {
    let carry = b;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i]! << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  return (
    '1'.repeat(zeros) +
    digits
      .reverse()
      .map((d) => ALPHABET[d])
      .join('')
  );
}

/** A 32-byte public key or blockhash from its base58 text. */
export function key32(s: string): Uint8Array {
  const k = base58Decode(s);
  if (k.length !== 32) throw new Error('not a 32-byte key');
  return k;
}

/** Solana's compact-u16 length prefix. */
function compactU16(n: number): number[] {
  const out: number[] = [];
  let v = n;
  for (;;) {
    const b = v & 0x7f;
    v >>= 7;
    if (v === 0) {
      out.push(b);
      return out;
    }
    out.push(b | 0x80);
  }
}

const SYSTEM_PROGRAM = new Uint8Array(32);

/** The unsigned transaction that moves `lamports` from `from` to `to`, valid for about a minute after `blockhash`. */
export function transferTx(from: string, to: string, lamports: bigint, blockhash: string): Uint8Array {
  if (lamports <= 0n || lamports >= 1n << 64n) throw new Error('bad amount');
  const sender = key32(from);
  const receiver = key32(to);
  if (sender.every((b, i) => b === receiver[i])) throw new Error('sender and receiver are the same');
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, lamports, true);
  const message = [
    1,
    0,
    1,
    ...compactU16(3),
    ...sender,
    ...receiver,
    ...SYSTEM_PROGRAM,
    ...key32(blockhash),
    ...compactU16(1),
    2,
    ...compactU16(2),
    0,
    1,
    ...compactU16(data.length),
    ...data,
  ];
  return Uint8Array.from([...compactU16(1), ...new Array<number>(64).fill(0), ...message]);
}
