import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <section className="section split" style={{ minHeight: '100svh', paddingTop: 'calc(var(--h-nav) + 8vh)' }}>
      <span>Wrong</span>
      <span>Fret</span>
      <p className="lede" style={{ margin: '2rem auto' }}>That page isn't on this neck. (404)</p>
      <Link className="btn btn--solid" to="/">Back to home</Link>
    </section>
  );
}
