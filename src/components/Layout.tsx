import { ArrowUpRight, Menu, X, Moon, Sun } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { applyTheme, readTheme, resolveTheme, saveTheme } from '../lib/theme';
import type { Theme, ResolvedTheme } from '../lib/theme';
import { brand, markPaths } from '../lib/brand';
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 160 160" aria-hidden="true" focusable="false">
      {markPaths.map((path, index) => (
        <path key={index} className={`brand-${path.tone}`} d={path.d} />
      ))}
    </svg>
  );
}
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label={`${brand.productName} home`}>
      <span className="brand-symbol">
        <BrandMark />
      </span>
      <span className="brand-wordmark">
        <span className="brand-name">{brand.name}</span> <span className="brand-product">PDF</span>
      </span>
    </Link>
  );
}
export function Header() {
  const [open, setOpen] = useState(false);
  // Match generated HTML, then restore once without temporarily applying the fallback theme.
  const theme = useRef<Theme>('dark');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');
  const [ready, setReady] = useState(false);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location]);
  useEffect(() => {
    theme.current = readTheme();
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setResolvedTheme(applyTheme(theme.current));
    update();
    setReady(true);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <nav className={open ? 'main-nav open' : 'main-nav'} aria-label="Main navigation">
          <Link to="/#tools" className={location.pathname !== '/' ? 'active' : ''}>
            Tools
          </Link>
          <Link to="/#how-it-works">How it works</Link>
          <Link to="/#privacy">Privacy</Link>
        </nav>
        <div className="header-right">
          <button
            className="icon-button theme-toggle"
            type="button"
            disabled={!ready}
            aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={() => {
              const next = resolveTheme(theme.current) === 'dark' ? 'light' : 'dark';
              theme.current = next;
              setResolvedTheme(next);
              saveTheme(next);
            }}
          >
            {resolvedTheme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            className="icon-button mobile-menu"
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-main">
        <Brand />
        <p>Document tools. Entirely on your device.</p>
        <Link to="/#tools">
          All tools <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="container footer-bottom">
        <span>
          © {new Date().getFullYear()} {brand.name}
        </span>
        <span>
          No document uploads. No accounts. <Link to="/#privacy">Usage analytics</Link>.{' '}
          <Link to="/alternatives/ilovepdf">iLovePDF alternative</Link>.
        </span>
      </div>
    </footer>
  );
}
