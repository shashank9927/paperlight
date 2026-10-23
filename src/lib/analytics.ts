import { seoForPath, siteOrigin } from './seo';

// Only public route names may enter analytics; never send a job or document value.
export function publicAnalyticsUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== siteOrigin) return null;
    const page = seoForPath(url.pathname);
    return page ? `${siteOrigin}${page.path}` : null;
  } catch {
    return null;
  }
}
