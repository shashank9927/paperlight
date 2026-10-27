import { lazy, Suspense, useEffect } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { Header, Footer } from './components/Layout';
import Home from './pages/Home';
import Alternative from './pages/Alternative';
import { Seo } from './components/Seo';
import { UsageAnalytics } from './components/UsageAnalytics';
import { getTool } from './lib/tools';
import { seoForPath } from './lib/seo';
import { AppBoundary, UpdateNotice } from './components/Recovery';
const Workspace = lazy(() => import('./pages/Workspace'));

function NotFound() {
  return (
    <main id="main" className="not-found">
      <span className="eyebrow">A small detour</span>
      <h1>This page slipped out of the stack.</h1>
      <p>Let’s get you back to the tools.</p>
      <Link to="/" className="button primary">
        Back to Havisu PDF
      </Link>
    </main>
  );
}

export default function App() {
  const location = useLocation();
  useEffect(() => {
    const page = seoForPath(location.pathname);
    if (!import.meta.env.PROD || !page || !('serviceWorker' in navigator)) return;
    let active = true;
    const message = { type: 'cache-public-page', path: page.path };
    const warm = () => {
      if (active) navigator.serviceWorker.controller?.postMessage(message);
    };
    navigator.serviceWorker.addEventListener('controllerchange', warm);
    void navigator.serviceWorker.ready
      .then((registration) => {
        if (active) registration.active?.postMessage(message);
      })
      .catch(() => {
        /* Offline caching is optional; document processing is independent. */
      });
    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener('controllerchange', warm);
    };
  }, [location.pathname]);
  useEffect(() => {
    if (location.hash)
      requestAnimationFrame(() =>
        document.getElementById(location.hash.slice(1))?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth',
        }),
      );
    else window.scrollTo(0, 0);
  }, [location.pathname, location.hash]);
  return (
    <>
      <Seo />
      <UsageAnalytics />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <UpdateNotice />
      <AppBoundary key={location.pathname}>
        <Suspense
          fallback={
            <main id="main" className="page-loading">
              <span className="spinner" /> Opening your workspace…
            </main>
          }
        >
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/alternatives/ilovepdf" element={<Alternative />} />
            <Route
              path="/tools/:toolId"
              element={
                getTool(location.pathname.split('/')[2] || '') ? (
                  <Workspace key={location.pathname} />
                ) : (
                  <NotFound />
                )
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </AppBoundary>
      <Footer />
    </>
  );
}
