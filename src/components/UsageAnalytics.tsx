import { Analytics } from '@vercel/analytics/react';
import { useLocation } from 'react-router-dom';
import { publicAnalyticsUrl } from '../lib/analytics';
import { seoForPath, siteOrigin } from '../lib/seo';

export function UsageAnalytics() {
  const { pathname } = useLocation();
  if (
    typeof window === 'undefined' ||
    window.location.origin !== siteOrigin ||
    document.documentElement.dataset.analytics !== 'true'
  )
    return null;
  const page = seoForPath(pathname);
  return (
    <Analytics
      mode="production"
      route={page?.path ?? null}
      path={page?.path ?? null}
      beforeSend={(event) => {
        if (event.type !== 'pageview') return null;
        const url = publicAnalyticsUrl(event.url);
        return url ? { type: 'pageview', url } : null;
      }}
    />
  );
}
