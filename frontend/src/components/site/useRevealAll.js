import { useEffect } from 'react';

/**
 * Adds `.in` to every [data-reveal] element as it scrolls into view,
 * including elements that mount later (route changes, results appearing).
 */
export function useRevealAll() {
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    const watched = new WeakSet();
    const scan = () => document.querySelectorAll('[data-reveal]:not(.in)').forEach((el) => {
      if (watched.has(el)) return;
      watched.add(el);
      io.observe(el);
    });
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
}
