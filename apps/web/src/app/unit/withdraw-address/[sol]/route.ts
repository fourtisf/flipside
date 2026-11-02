import { isSolAddress } from '@/lib/solana-rpc';
import { unitAddresses } from '@/lib/unit';

export const dynamic = 'force-dynamic';

/** GET /unit/withdraw-address/<Solana address>: { address }, where USOL sent on Hyperliquid is paid out as SOL to that wallet (lib/unit.ts). */
export async function GET(_req: Request, { params }: { params: Promise<{ sol: string }> }) {
  const { sol } = await params;
  const headers = { 'Cache-Control': 'no-store' };
  if (!isSolAddress(sol)) return Response.json({ error: 'not a Solana address' }, { status: 400, headers });
  try {
    return Response.json({ address: await unitAddresses().withdrawAddress(sol) }, { headers });
  } catch {
    return Response.json({ error: "couldn't get a withdrawal address from Unit" }, { status: 502, headers });
  }
}
