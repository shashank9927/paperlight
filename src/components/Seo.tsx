import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { seoForPath, siteOrigin, structuredData } from '../lib/seo';

export function Seo() {
  const { pathname } = useLocation();
  useEffect(() => {
    const page = seoForPath(pathname);
    const setMeta = (selector: string, attributes: Record<string, string>) => {
      let element = document.head.querySelector(selector);
      if (!element) {
        element = document.createElement(selector.startsWith('link') ? 'link' : 'meta');
        document.head.append(element);
      }
      Object.entries(attributes).forEach(([key, value]) => element!.setAttribute(key, value));
    };
    const title = page?.title || 'Page not found | Paperlight';
    const description = page?.description || 'Explore Paperlight’s free PDF tools.';
    document.title = title;
    setMeta('meta[name="description"]', { name: 'description', content: description });
    setMeta('meta[name="robots"]', {
      name: 'robots',
      content:
        page && document.documentElement.dataset.indexable === 'true'
          ? 'index,follow'
          : 'noindex,follow',
    });
    document.querySelector('link[rel="canonical"]')?.remove();
    document.getElementById('seo-structured-data')?.remove();
    for (const [property, value] of Object.entries({
      'og:title': title,
      'og:description': description,
      'og:url': page ? `${siteOrigin}${page.path}` : '',
      'og:image': `${siteOrigin}/social-card.png`,
      'og:type': 'website',
      'og:site_name': 'Paperlight',
    }))
      setMeta(`meta[property="${property}"]`, { property, content: value });
    for (const [name, value] of Object.entries({
      'twitter:card': 'summary_large_image',
      'twitter:title': title,
      'twitter:description': description,
      'twitter:image': `${siteOrigin}/social-card.png`,
    }))
      setMeta(`meta[name="${name}"]`, { name, content: value });
    if (page) {
      setMeta('link[rel="canonical"]', { rel: 'canonical', href: `${siteOrigin}${page.path}` });
      const data = document.createElement('script');
      data.id = 'seo-structured-data';
      data.type = 'application/ld+json';
      data.textContent = JSON.stringify(structuredData(page));
      document.head.append(data);
    }
  }, [pathname]);
  return null;
}
