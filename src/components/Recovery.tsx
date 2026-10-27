import { Component, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export class AppBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main id="main" className="not-found" role="alert">
        <h1>Havisu PDF couldn’t open this workspace.</h1>
        <p>
          A required app component may be unavailable. Your original files on your device are
          unchanged.
        </p>
        <p>Reloading clears files and edits held in this tab.</p>
        <button className="button primary" onClick={() => window.location.reload()}>
          Reload Havisu PDF
        </button>
        <Link className="button secondary" to="/">
          Back to tools
        </Link>
      </main>
    );
  }
}

export function UpdateNotice() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [workspace, setWorkspace] = useState({ hasDocuments: false, busy: false });
  const requested = useRef(false);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    let active = true,
      cleanup: (() => void) | undefined;
    const state = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail && typeof detail.hasDocuments === 'boolean' && typeof detail.busy === 'boolean')
        setWorkspace(detail);
    };
    const changed = () => {
      if (requested.current) window.location.reload();
    };
    window.addEventListener('paperlight-workspace-state', state);
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    void navigator.serviceWorker.ready
      .then((registration) => {
        if (!active) return;
        const check = () => {
          if (active && registration.waiting) setWaiting(registration.waiting);
        };
        const found = () => {
          const worker = registration.installing;
          if (worker) worker.addEventListener('statechange', check);
        };
        check();
        registration.addEventListener('updatefound', found);
        cleanup = () => registration.removeEventListener('updatefound', found);
      })
      .catch(() => {});
    return () => {
      active = false;
      cleanup?.();
      window.removeEventListener('paperlight-workspace-state', state);
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
    };
  }, []);
  if (!waiting) return null;
  const blocked = workspace.hasDocuments || workspace.busy;
  return (
    <aside className="update-notice" role="status">
      <span>
        {blocked
          ? 'An update is ready. Finish and clear your workspace before updating.'
          : 'A new version of Havisu PDF is ready.'}
      </span>
      <button
        className="button small secondary"
        disabled={blocked}
        onClick={() => {
          requested.current = true;
          waiting.postMessage({ type: 'activate-update' });
        }}
      >
        Update Havisu PDF
      </button>
    </aside>
  );
}
