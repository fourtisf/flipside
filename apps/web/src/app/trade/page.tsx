import { redirect } from 'next/navigation';
import { DEFAULT_MINT } from '@/mock/fixtures';

/** /trade opens the terminal on the default coin, like the prototype's Trade button. */
export default function TradeIndex() {
  redirect(`/trade/${DEFAULT_MINT}`);
}
