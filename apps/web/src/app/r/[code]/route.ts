import { NextResponse, type NextRequest } from 'next/server';

const CODE = /^[a-z0-9_-]{2,32}$/i;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** /r/[code]: remember the referrer for 30 days, then go to Markets. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // A relative Location. Behind Nginx, req.url carries Next's own listen address (localhost:3000).
  const res = new NextResponse(null, { status: 307, headers: { Location: '/' } });
  if (CODE.test(code)) {
    res.cookies.set('coinside_ref', code.toLowerCase(), {
      path: '/',
      maxAge: THIRTY_DAYS,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return res;
}
