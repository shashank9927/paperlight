import { useEffect, useState } from 'react';

export function OfflineNotice() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return offline ? (
    <aside className="update-notice" role="status">
      You’re offline. Previously loaded tools may still work.
    </aside>
  ) : null;
}
