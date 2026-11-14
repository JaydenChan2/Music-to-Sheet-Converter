import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useStudio } from '../../studio/studio';
import { useRevealAll } from './useRevealAll';

const BRAND = 'Guitar Tab AI';
const REPO = 'https://github.com/JaydenChan2/Music-to-Sheet-Converter';

const ROUTES = [
  { to: '/', label: 'Home' },
  { to: '/studio', label: 'Studio' },
  { to: '/features', label: 'Features' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/accuracy', label: 'Accuracy' },
];

function navClass({ isActive }) {
  return `nav__link${isActive ? ' is-on' : ''}`;
}

function Nav() {
  const { isProcessing } = useStudio();
  const { pathname } = useLocation();
  // The menu is open only on the page it was opened from, so navigating closes it.
  const [openOn, setOpenOn] = useState(null);
  const open = openOn === pathname;
  const setOpen = (v) => setOpenOn(typeof v === 'function' ? (v(open) ? pathname : null) : v ? pathname : null);
  const [solid, setSolid] = useState(false);
  const [hidden, setHidden] = useState(false);
  const progressRef = useRef(null);
  const lastY = useRef(0);

  useEffect(() => {
    document.body.classList.toggle('menu-open', open);
    document.body.style.overflow = open ? 'hidden' : '';
    const onEsc = (e) => e.key === 'Escape' && setOpenOn(null);
    window.addEventListener('keydown', onEsc);
    return () => window.removeEventListener('keydown', onEsc);
  }, [open]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
      setSolid(y > 40);
      if (y < 400 || y < lastY.current - 4) setHidden(false);
      else if (y > lastY.current + 4) setHidden(true);
      lastY.current = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [pathname]);

  return (
    <>
      <div className="progress" ref={progressRef} />
      <header className={`nav${solid ? ' is-solid' : ''}${hidden && !open ? ' is-hidden' : ''}`}>
        <div className="nav__side">
          <NavLink className={navClass} to="/studio">
            Studio{isProcessing && pathname !== '/studio' && <span className="pulse" title="Transcribing" />}
          </NavLink>
          <NavLink className={navClass} to="/features">Features</NavLink>
        </div>
        <Link className="brand" to="/">{BRAND}</Link>
        <div className="nav__side nav__side--r">
          <NavLink className={navClass} to="/accuracy">Accuracy</NavLink>
          <button className="burger" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
            <span /><span /><span />
          </button>
        </div>
      </header>
      <nav className={`menu${open ? ' is-open' : ''}`} aria-hidden={!open}>
        <ul className="menu__list">
          {ROUTES.map((r, i) => (
            <li key={r.to}>
              <NavLink to={r.to} end className={({ isActive }) => (isActive ? 'is-on' : '')} tabIndex={open ? 0 : -1}>
                <small>{String(i + 1).padStart(2, '0')}</small>{r.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot__cols">
          <div className="foot__about">
            <p className="foot__brand">{BRAND}</p>
            <p className="body" style={{ margin: 0, maxWidth: '38ch' }}>
              Polyphonic guitar transcription: neural pitch detection, source separation and
              fingering search, turned into tab you can read, hear and download.
            </p>
            <div className="foot__social">
              <a href={REPO} target="_blank" rel="noreferrer" aria-label="Source on GitHub">
                <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                </svg>
              </a>
            </div>
          </div>
          <div>
            <h5>Product</h5>
            <ul>
              <li><Link to="/studio">Studio</Link></li>
              <li><Link to="/features">Features</Link></li>
              <li><Link to="/features#tunings">Tunings & capo</Link></li>
              <li><Link to="/features#synth">Synth playback</Link></li>
            </ul>
          </div>
          <div>
            <h5>Method</h5>
            <ul>
              <li><Link to="/how-it-works">How it works</Link></li>
              <li><Link to="/how-it-works#run-locally">Run it locally</Link></li>
              <li><Link to="/accuracy">Accuracy</Link></li>
              <li><Link to="/accuracy#limitations">Limitations</Link></li>
            </ul>
          </div>
          <div>
            <h5>Credits</h5>
            <ul>
              <li><a href="https://github.com/spotify/basic-pitch" target="_blank" rel="noreferrer">basic-pitch</a></li>
              <li><a href="https://github.com/facebookresearch/demucs" target="_blank" rel="noreferrer">Demucs</a></li>
              <li><a href="https://guitarset.weebly.com/" target="_blank" rel="noreferrer">GuitarSet</a></li>
              <li><a href={REPO} target="_blank" rel="noreferrer">Source code</a></li>
            </ul>
          </div>
        </div>
        <div className="foot__base">
          <span>© {new Date().getFullYear()} {BRAND}</span>
          <span>Audio to tablature</span>
        </div>
      </div>
    </footer>
  );
}

/** Scroll to the top on route change, or to #hash targets when present. */
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

export default function Layout() {
  useRevealAll();
  return (
    <>
      <ScrollManager />
      <Nav />
      <main id="top">
        <Outlet />
      </main>
      <Footer />
    </>
  );
}
