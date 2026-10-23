import { ArrowUpRight, Menu, X, Layers2, SunMoon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { applyTheme, readTheme, saveTheme } from '../lib/theme';
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
  const [theme, setTheme] = useState<Theme>(readTheme);
  const location = useLocation();
  useEffect(() => {
    setOpen(false);
  }, [location]);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => applyTheme(theme);
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
          <label className="theme-switch">
            <SunMoon size={16} />
            <span className="visually-hidden">Appearance</span>
            <select
              aria-label="Appearance"
              value={theme}
              onChange={(e) => {
                const next = e.target.value as Theme;
                setTheme(next);
                saveTheme(next);
              }}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
              <option value="system">System</option>
            </select>
          </label>
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
        <span>No uploads. No accounts. No tracking.</span>
      </div>
    </footer>
  );
}
