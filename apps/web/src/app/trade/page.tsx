import { redirect } from 'next/navigation';
import { DEFAULT_MARKET, marketHref } from '@/hl/markets';
import { LIVE } from '@/lib/edition';
import { DEFAULT_MINT } from '@/mock/fixtures';

// Redirect per request. A prerendered redirect is served as a 307 with no Location header, which
// only works for browsers that run the page's JavaScript.
export const dynamic = 'force-dynamic';

/** /trade opens the terminal on the default market, like the prototype's Trade button. */
export default function TradeIndex() {
  redirect(LIVE ? marketHref(DEFAULT_MARKET) : `/trade/${DEFAULT_MINT}`);
}
