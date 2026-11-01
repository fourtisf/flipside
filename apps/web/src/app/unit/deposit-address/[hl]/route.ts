import { unitAddresses } from '@/lib/unit';

export const dynamic = 'force-dynamic';

/** GET /unit/deposit-address/<0x address>: { address } where SOL sent is credited to that account (lib/unit.ts). */
export async function GET(_req: Request, { params }: { params: Promise<{ hl: string }> }) {
  const { hl } = await params;
  const headers = { 'Cache-Control': 'no-store' };
  if (!/^0x[0-9a-fA-F]{40}$/.test(hl))
    return Response.json({ error: 'not a Hyperliquid address' }, { status: 400, headers });
  try {
    return Response.json({ address: await unitAddresses().depositAddress(hl) }, { headers });
  } catch {
    return Response.json({ error: "couldn't get a deposit address from Unit" }, { status: 502, headers });
  }
}
