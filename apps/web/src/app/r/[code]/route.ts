import { NextResponse, type NextRequest } from 'next/server';

const CODE = /^[a-z0-9_-]{2,32}$/i;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/** /r/[code]: remember the referrer for 30 days, then go to Markets. */
export function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const res = NextResponse.redirect(new URL('/', req.url), 307);
  if (CODE.test(params.code)) {
    res.cookies.set('flipside_ref', params.code.toLowerCase(), {
      path: '/',
      maxAge: THIRTY_DAYS,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    });
  }
  return res;
}
