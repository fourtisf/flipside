import { SolBalances, isSolAddress } from '@/lib/solana-rpc';

// One per server process; answers are kept for a few seconds (lib/solana-rpc.ts).
const balances = new SolBalances();

export const dynamic = 'force-dynamic';

/** GET /solana/balance/<address>: { lamports } for a Solana wallet, read on the server (lib/solana-rpc.ts). */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const headers = { 'Cache-Control': 'no-store' };
  if (!isSolAddress(address))
    return Response.json({ error: 'not a Solana address' }, { status: 400, headers });
  try {
    return Response.json({ lamports: await balances.get(address) }, { headers });
  } catch {
    return Response.json({ error: "couldn't read the balance" }, { status: 502, headers });
  }
}
