import Link from 'next/link';
import type { ReactNode } from 'react';

/** A page that has nothing real to show before trading opens (pre-launch edition only). */
export function PreLaunchPage({
  id,
  title,
  intro,
  state,
  note,
  link,
}: {
  id: string;
  title: string;
  intro: ReactNode;
  state: string;
  note: string;
  link: [href: string, label: string];
}) {
  return (
    <section id={id} className="wrap page" aria-labelledby={`${id}-h`}>
      <div className="ph">
        <div>
          <h1 id={`${id}-h`}>{title}</h1>
          <p>{intro}</p>
        </div>
      </div>
      <div className="pn">
        <div className="empty soon-page">
          <b>{state}</b>
          {note}
          <Link className="btn o" href={link[0]}>
            {link[1]}
          </Link>
        </div>
      </div>
    </section>
  );
}
