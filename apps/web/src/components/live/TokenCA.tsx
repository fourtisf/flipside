'use client';

import { useState } from 'react';
import { TOKEN_CA, X_URL } from '@/lib/social';

/** The X logo, as X publishes it. */
function XLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z"
      />
    </svg>
  );
}

/**
 * Coinside's token: its contract address with a Copy button ("Coming soon" if the address is malformed), and
 * Coinside's X account next to it.
 */
export function TokenCA({ id = 'ca' }: { id?: string }) {
  const [copied, setCopied] = useState(false);
  const text = TOKEN_CA || 'Coming soon';
  const copy = () =>
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  return (
    <div className="ca-row">
      <div className="ca" id={id}>
        <span className="ca-k">CA</span>
        {TOKEN_CA ? (
          // too narrow for all of it: the start gives way, the last six characters stay (…Lxpump)
          <code title={TOKEN_CA}>
            <span className="ca-a">{TOKEN_CA.slice(0, -6)}</span>
            <span className="ca-b">{TOKEN_CA.slice(-6)}</span>
          </code>
        ) : (
          <code className="soon">{text}</code>
        )}
        <button
          type="button"
          className="ca-copy"
          onClick={copy}
          aria-label={`Copy ${TOKEN_CA ? 'contract address' : '"Coming soon"'}`}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {X_URL && (
        <a className="ca-x" href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="Coinside on X">
          <XLogo />
        </a>
      )}
    </div>
  );
}
