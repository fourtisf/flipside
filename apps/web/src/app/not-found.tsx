import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="wrap page" aria-labelledby="h-nf">
      <div className="ph">
        <div>
          <h1 id="h-nf">Nothing here</h1>
          <p>
            That page or coin isn&apos;t on Coinside. Coins open once they reach a $30K market cap, 100
            holders and 7 SOL in trading fees.
          </p>
        </div>
        <div className="acts2">
          <Link className="btn w" href="/">
            Back to markets
          </Link>
        </div>
      </div>
    </section>
  );
}
