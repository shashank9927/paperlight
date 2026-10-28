import { describe, expect, it } from 'vitest';
import { tools } from '../src/lib/tools';
import { seoPages, seoForPath, siteOrigin, structuredData } from '../src/lib/seo';
import { publicAnalyticsUrl } from '../src/lib/analytics';
import { brand } from '../src/lib/brand';

describe('public SEO and analytics contract', () => {
  it('identifies the product site with the parent brand as its alternative name', () => {
    const websites = structuredData(seoForPath('/')!)['@graph'].filter(
      (entry) => entry['@type'] === 'WebSite',
    );
    expect(websites).toEqual([
      {
        '@type': 'WebSite',
        '@id': `${siteOrigin}/#website`,
        name: brand.productName,
        alternateName: brand.name,
        url: `${siteOrigin}/`,
      },
    ]);
  });
  it('covers all tools with distinct, usable content and valid related routes', () => {
    expect(seoPages).toHaveLength(14);
    expect(new Set(seoPages.map((page) => page.title)).size).toBe(14);
    expect(new Set(seoPages.map((page) => page.description)).size).toBe(14);
    for (const tool of tools) {
      const page = seoForPath(`/tools/${tool.id}`)!;
      expect(page.steps).toHaveLength(3);
      expect(page.features.length).toBeGreaterThan(0);
      expect(page.limitations).toBeTruthy();
      expect(page.faqs).toHaveLength(3);
      for (const id of page.related) expect(seoForPath(`/tools/${id}`)).toBeDefined();
      const data = structuredData(page);
      expect(data['@graph'].map((item) => item['@type'])).toEqual([
        'WebApplication',
        'BreadcrumbList',
      ]);
      expect(JSON.stringify(data)).not.toMatch(/aggregateRating|reviewRating/);
    }
    expect(seoForPath('/tools/missing')).toBeUndefined();
  });
  it('allows only known production page URLs and removes all queries and fragments', () => {
    expect(
      publicAnalyticsUrl(
        `${siteOrigin}/tools/merge?password=secret&filename=private.pdf#signature`,
      ),
    ).toBe(`${siteOrigin}/tools/merge`);
    expect(publicAnalyticsUrl(`${siteOrigin}/?q=confidential`)).toBe(`${siteOrigin}/`);
    for (const url of [
      `${siteOrigin}/tools/private.pdf`,
      `${siteOrigin}/private/signature`,
      'https://other.vercel.app/tools/merge',
      'http://localhost:4180/',
      'invalid',
    ])
      expect(publicAnalyticsUrl(url)).toBeNull();
  });
});
