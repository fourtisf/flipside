'use client';

import './globals.css';

/** The header or another part of the layout crashed, so nothing else can render: a plain way back. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main>
          <section className="wrap page" aria-labelledby="h-err">
            <div className="ph">
              <div>
                <h1 id="h-err">Something went wrong</h1>
                <p>Coinside hit an error and stopped. Try again, or reload the page.</p>
              </div>
              <div className="acts2">
                <button className="btn w" onClick={reset}>
                  Try again
                </button>
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load, since the app itself is what failed */}
                <a className="btn o" href="/">
                  Back to markets
                </a>
              </div>
            </div>
          </section>
        </main>
      </body>
    </html>
  );
}
