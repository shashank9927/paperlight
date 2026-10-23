import { ArrowUpRight, Menu, X, Layers2, Moon, Sun } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { applyTheme, readTheme, resolveTheme, saveTheme } from '../lib/theme';
import type { Theme } from '../lib/theme';
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Paperlight home">
      <span className="brand-symbol">
        <Layers2 size={24} strokeWidth={1.7} />
      </span>
      Paperlight
    </Link>
  );
}
export function Header() {
  const [open, setOpen] = useState(false);
  // Keep the first render identical to generated HTML; restore preferences after hydration.
  const [theme, setTheme] = useState<Theme>('dark');
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(theme));
  const location = useLocation();
  useEffect(() => {
    setTheme(readTheme());
  }, []);
  useEffect(() => {
    setOpen(false);
  }, [location]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setResolvedTheme(applyTheme(theme));
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);
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
            aria-label={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} theme`}
            onClick={() => {
              const next = resolvedTheme === 'dark' ? 'light' : 'dark';
              setTheme(next);
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
        <span>© {new Date().getFullYear()} Paperlight</span>
        <span>
          No document uploads. No accounts. <Link to="/#privacy">Usage analytics</Link>.
        </span>
      </div>
    </footer>
  );
}
