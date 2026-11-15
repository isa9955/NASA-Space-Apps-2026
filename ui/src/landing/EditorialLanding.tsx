import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { ArrowRight } from 'lucide-react';
import { MarsGlobe } from './mars-globe';
import { Starfield } from './starfield';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';
import '@fontsource/geist/latin-400.css';
import '@fontsource/geist/latin-500.css';
import '@fontsource/geist-mono/latin-400.css';
import './editorial.css';

const delay = (ms: number) => ({ '--d': `${ms}ms` }) as CSSProperties;

export default function EditorialLanding() {
  const [ready, setReady] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const navigationTimer = useRef<number>();
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    document.title = 'Conquering Mars — NASA Space Apps 2026';
    const timer = window.setTimeout(() => setReady(true), 2500);
    // A back/forward-cache restore must not leave the page faded out.
    const onPageShow = () => setLeaving(false);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      clearTimeout(timer);
      clearTimeout(navigationTimer.current);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  const enter = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || reducedMotion) return;
    event.preventDefault();
    if (navigationTimer.current !== undefined) return;
    setLeaving(true);
    navigationTimer.current = window.setTimeout(() => {
      navigationTimer.current = undefined;
      window.location.assign('/explorer');
    }, 520);
  };

  return (
    <div className="editorial" data-ready={ready} data-leaving={leaving}>
      <Starfield />
      <div className="editorial-content">
        <header className="editorial-header editorial-gutter">
          <div className="editorial-brand editorial-fade" style={delay(150)}>
            <span aria-hidden="true" />Conquering Mars
          </div>
        </header>
        <main className="editorial-main editorial-gutter">
          <div className="editorial-planet">
            <MarsGlobe onSettled={() => setReady(true)} lightDirection={[-0.8, 0.42, 0.62]} degreesPerSecond={6} />
          </div>
          <div className="editorial-copy">
            <p className="editorial-eyebrow editorial-reveal" style={delay(350)}>NASA Space Apps 2026 <span>/</span> Mars Exploration</p>
            <h1 className="editorial-reveal" style={delay(500)}>Conquering Mars<span>.</span></h1>
            <p className="editorial-tagline editorial-reveal" style={delay(700)}>Your survival guide to the Red Planet.</p>
            <p className="editorial-description editorial-reveal" style={delay(820)}>Explore Martian terrain, understand environmental challenges, and investigate potential sites for future human exploration.</p>
            <div className="editorial-action editorial-reveal" style={delay(960)}>
              <a href="/explorer" onClick={enter}>Enter the Explorer<ArrowRight aria-hidden="true" size={16} /></a>
            </div>
          </div>
        </main>
        <footer className="editorial-footer editorial-gutter">
          <p className="editorial-region editorial-fade" style={delay(1200)}><span aria-hidden="true" />Featured Region <b>/</b> Deuteronilus Mensae</p>
        </footer>
      </div>
    </div>
  );
}
