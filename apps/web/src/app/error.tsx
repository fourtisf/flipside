'use client';

import Link from 'next/link';

/** A page that crashed: say so and offer a way on, instead of a blank screen. */
export default function PageError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="wrap page" aria-labelledby="h-err">
      <div className="ph">
        <div>
          <h1 id="h-err">Something went wrong</h1>
          <p>This page hit an error and stopped. Try again, or go back to the markets.</p>
        </div>
        <div className="acts2">
          <button className="btn w" onClick={reset}>
            Try again
          </button>
          <Link className="btn o" href="/">
            Back to markets
          </Link>
        </div>
      </div>
    </section>
  );
}
