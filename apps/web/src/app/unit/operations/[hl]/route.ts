import { unitOperations } from '@/lib/unit';

export const dynamic = 'force-dynamic';

/** GET /unit/operations/<0x address>: { operations } from Unit, for the deposit tracker (lib/unit.ts). */
export async function GET(_req: Request, { params }: { params: Promise<{ hl: string }> }) {
  const { hl } = await params;
  const headers = { 'Cache-Control': 'no-store' };
  if (!/^0x[0-9a-fA-F]{40}$/.test(hl))
    return Response.json({ error: 'not a Hyperliquid address' }, { status: 400, headers });
  try {
    return Response.json({ operations: await unitOperations(hl) }, { headers });
  } catch {
    return Response.json({ error: "couldn't read Unit's operations" }, { status: 502, headers });
  }
}
