import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

export const ArrowRight = ({ w = 19 }) => (
  <svg width={w} height="11" viewBox="0 0 19 11" fill="none" aria-hidden="true">
    <path d="M0 5.5h17.5M13 1l4.5 4.5L13 10" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);
export const ArrowLeft = () => (
  <svg width="19" height="11" viewBox="0 0 19 11" fill="none" aria-hidden="true">
    <path d="M19 5.5H1.5M6 1L1.5 5.5 6 10" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);
export const Plus = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
    <path d="M7 0v14M0 7h14" stroke="currentColor" strokeWidth="1.2" />
  </svg>
);

export const LinkArrow = ({ to, href, children }) => {
  const inner = <>{children} <ArrowRight /></>;
  if (href) return <a className="link-arrow" href={href} target="_blank" rel="noreferrer">{inner}</a>;
  return <Link className="link-arrow" to={to}>{inner}</Link>;
};

/** Runs `onEnter` once when the element scrolls into view. */
function useInView(onEnter, threshold = 0.3) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        onEnter();
        io.disconnect();
      }
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [onEnter, threshold]);
  return ref;
}

/** Odometer: each digit rolls up to its value when the number scrolls into view. */
export function Odo({ value }) {
  const [on, setOn] = useState(false);
  const ref = useInView(useCallback(() => setOn(true), []));
  const chars = String(value).split('');
  return (
    <span className="odo" ref={ref} aria-label={String(value)}>
      {chars.map((c, i) =>
        /\d/.test(c) ? (
          <span className="odo__col" key={i} aria-hidden="true">
            <span className="odo__strip" style={{ transform: `translateY(${on ? -Number(c) : 0}em)`, transitionDelay: `${i * 0.08}s` }}>
              {Array.from({ length: 10 }, (_, d) => <span key={d}>{d}</span>)}
            </span>
          </span>
        ) : (
          <span key={i} aria-hidden="true">{c}</span>
        ),
      )}
    </span>
  );
}

export function Stat({ value, suffix, label, note, delay }) {
  return (
    <div className="stat" data-reveal data-reveal-delay={delay}>
      <div className="stat__rule" />
      <div className="stat__value"><Odo value={value} />{suffix && <span className="stat__suffix">{suffix}</span>}</div>
      <p className="stat__label">{label}</p>
      {note && <p className="stat__note">{note}</p>}
    </div>
  );
}

/** Full-height horizontal gallery with numbered index and square step buttons. */
export function Rail({ id, eyebrow, heading, slides }) {
  const [i, setI] = useState(0);
  const [x, setX] = useState(0);
  const trackRef = useRef(null);
  const drag = useRef(null);
  const last = slides.length - 1;
  const go = useCallback((n) => setI(Math.max(0, Math.min(last, n))), [last]);

  useEffect(() => {
    const place = () => {
      const track = trackRef.current;
      const slide = track?.children[i];
      if (!slide) return;
      setX(-(slide.offsetLeft - (track.parentElement.clientWidth - slide.clientWidth) / 2));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [i]);

  const onKey = (e) => {
    if (e.key === 'ArrowRight') go(i + 1);
    if (e.key === 'ArrowLeft') go(i - 1);
  };
  const onPointerDown = (e) => { drag.current = e.clientX; };
  const onPointerUp = (e) => {
    if (drag.current === null) return;
    const dx = e.clientX - drag.current;
    drag.current = null;
    if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1));
  };

  return (
    <section className="rail" id={id} onKeyDown={onKey} aria-roledescription="carousel" aria-label={eyebrow}>
      <div className="rail__head" data-reveal>
        <p className="eyebrow">{eyebrow}</p>
        <h3 className="h3">{heading}</h3>
      </div>
      <div className="rail__index">
        {slides.map((s, n) => (
          <button key={n} className={n === i ? 'is-on' : ''} onClick={() => go(n)} aria-label={`Show ${s.title}`}>
            {String(n + 1).padStart(2, '0')}
          </button>
        ))}
      </div>
      <div className="rail__nav">
        <button className="sqbtn" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous"><ArrowLeft /></button>
        <button className="sqbtn" onClick={() => go(i + 1)} disabled={i === last} aria-label="Next"><ArrowRight /></button>
      </div>
      <div
        className="rail__track"
        ref={trackRef}
        style={{ transform: `translateX(${x}px)`, touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
      >
        {slides.map((s, n) => (
          <figure key={n} className={`rail__slide media${n === i ? ' is-active' : ''}`} onClick={() => n !== i && go(n)}>
            {s.visual}
            <div className="scrim scrim--bottom" />
            <figcaption>
              {String(n + 1).padStart(2, '0')} — {s.title}
              {s.text && <span>{s.text}</span>}
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

// Slides are positioned relative to the track, so a slide's scroll target is offsetLeft - padding.
const target = (t, k) => k.offsetLeft - parseFloat(getComputedStyle(t).paddingLeft);

/** Scroll-snap carousel with round step buttons and pill dots. */
export function Carousel({ eyebrow, heading, aside, items }) {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);
  const [edges, setEdges] = useState({ start: true, end: false });

  const sync = useCallback(() => {
    const t = trackRef.current;
    if (!t) return;
    const kids = [...t.children];
    const dist = (k) => Math.abs(target(t, k) - t.scrollLeft);
    setActive(kids.reduce((best, k, n) => (dist(k) < dist(kids[best]) ? n : best), 0));
    setEdges({ start: t.scrollLeft < 4, end: t.scrollLeft + t.clientWidth >= t.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [sync]);

  const scrollTo = (n) => {
    const t = trackRef.current;
    const k = t?.children[n];
    if (!k) return;
    t.scrollTo({ left: target(t, k) });
  };

  return (
    <div className="carousel">
      <div className="carousel__head">
        <div data-reveal>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="h2">{heading}</h2>
        </div>
        {aside}
      </div>
      <div className="carousel__track" ref={trackRef} onScroll={sync}>
        {items.map((it, n) => (
          <Link key={n} to={it.to} className="gl-slide">
            <div className="media">{it.visual}</div>
            <div className="scrim scrim--bottom" />
            <h3 className="gl-slide__title">{it.title}</h3>
            <div className="gl-slide__foot">
              <p>{it.text}</p>
              <span className="plus" aria-hidden="true"><Plus /></span>
            </div>
          </Link>
        ))}
      </div>
      <div className="carousel__ui">
        <button className="cbtn" onClick={() => scrollTo(active - 1)} disabled={edges.start} aria-label="Previous"><ArrowLeft /></button>
        <div className="dots">
          {items.map((it, n) => (
            <button key={n} className={n === active ? 'is-on' : ''} onClick={() => scrollTo(n)} aria-label={`Go to ${it.title}`} />
          ))}
        </div>
        <button className="cbtn" onClick={() => scrollTo(active + 1)} disabled={edges.end} aria-label="Next"><ArrowRight /></button>
      </div>
    </div>
  );
}
