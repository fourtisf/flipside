import { solanaRpc } from '@/lib/solana-rpc';

export const dynamic = 'force-dynamic';

/** GET /solana/blockhash: { blockhash } for a deposit transaction the person's wallet signs (lib/solana-rpc.ts). */
export async function GET() {
  const headers = { 'Cache-Control': 'no-store' };
  try {
    return Response.json({ blockhash: await solanaRpc().blockhash() }, { headers });
  } catch {
    return Response.json({ error: "couldn't reach Solana" }, { status: 502, headers });
  }
}
