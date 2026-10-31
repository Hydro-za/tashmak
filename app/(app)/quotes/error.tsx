'use client';

export default function QuotesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="setup card" role="alert">
    <h1>We couldn’t load this quote</h1>
    <p className="muted">The quote data could not be loaded. Your saved quote is unchanged. Try again, or contact an administrator if this keeps happening.</p>
    <button className="btn primary" onClick={reset}>Try again</button>
  </main>;
}
