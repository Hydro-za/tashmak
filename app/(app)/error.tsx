'use client';

import { useEffect } from 'react';

export default function WorkspaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Tashmak workspace page failed to load:', error);
  }, [error]);

  return (
    <main className="main" style={{ display: 'grid', placeItems: 'start center', paddingTop: 48 }}>
      <section className="card" role="alert" style={{ width: '100%', maxWidth: 520, textAlign: 'center', padding: 28 }}>
        <h1 style={{ marginBottom: 10 }}>This page couldn’t load</h1>
        <p className="muted">Your saved information has not been changed by this error. Try loading the page again. If it keeps happening, contact an owner.</p>
        <div className="pillrow" style={{ justifyContent: 'center', marginTop: 18 }}>
          <button type="button" className="btn primary" onClick={() => reset()}>Try again</button>
          <a className="btn" href="/dashboard">Back to dashboard</a>
        </div>
        {error.digest && <p className="muted" style={{ fontSize: 11, marginTop: 14 }}>Reference: {error.digest}</p>}
      </section>
    </main>
  );
}
