import { logoUrl, tokName } from '@/hl/markets';
import { Tok } from '../ui';

/** A Hyperliquid market's avatar: its icon, or the letter avatar if it has none. */
export function CoinTok({ name, size }: { name: string; size: number }) {
  return <Tok s={tokName(name)} logo={logoUrl(name)} size={size} lazy />;
}
