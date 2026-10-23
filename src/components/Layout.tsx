import { ArrowUpRight, ChevronDown, ShieldCheck, Menu, X } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useState } from 'react';

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Paperlight home">
      <span className="brand-symbol">
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <path d="M5 7h11l11 9-11 9H5l11-9z" fill="currentColor" />
          <path d="m5 7 11 9-11 9" fill="#c5b7f5" />
        </svg>
      </span>
      <span>
        paperlight<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Brand />
        <nav className={open ? 'main-nav open' : 'main-nav'} aria-label="Main navigation">
          <Link
            to="/#tools"
            onClick={() => setOpen(false)}
            className={location.pathname !== '/' ? 'active' : ''}
          >
            All tools <ChevronDown size={13} />
          </Link>
          <Link to="/#how-it-works" onClick={() => setOpen(false)}>
            How it works
          </Link>
          <Link to="/#privacy" onClick={() => setOpen(false)}>
            Our privacy promise
          </Link>
        </nav>
        <div className="header-right">
          <span className="private-indicator">
            <span />
            100% on your device
          </span>
          <button
            className="icon-button mobile-menu"
            aria-label={open ? 'Close navigation' : 'Open navigation'}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
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
        <div>
          <Brand />
          <p>
            A little less paperwork.
            <br />A little more possibility.
          </p>
        </div>
        <div className="footer-links">
          <Link to="/#tools">
            Explore tools <ArrowUpRight size={13} />
          </Link>
          <Link to="/#privacy">Privacy, by design</Link>
          <Link to="/#faq">A few answers</Link>
        </div>
        <div className="footer-note">
          <ShieldCheck size={18} />
          <span>
            No uploads. No accounts.
            <br />
            Just you and your files.
          </span>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© {new Date().getFullYear()} Paperlight</span>
        <span>
          Made for lighter work. <span className="tiny-star">✧</span>
        </span>
      </div>
    </footer>
  );
}
