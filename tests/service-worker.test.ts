import { describe, it, expect } from 'vitest';
import { runInNewContext } from 'node:vm';
import { serviceWorkerSource } from '../scripts/service-worker';

describe('optional offline caching', () => {
  it('keeps HTML and allowlisted assets from a later deployment in their own release cache', async () => {
    const handlers: Record<string, (event: unknown) => void> = {};
    const stores = new Map<string, Map<string, Response>>();
    const pending: Promise<unknown>[] = [];
    let offline = false;
    const key = (value: string | { url: string }) =>
      new URL(typeof value === 'string' ? value : value.url, 'https://paperlight.test').pathname;
    const caches = {
      keys: async () => [...stores.keys()],
      open: async (name: string) => {
        let store = stores.get(name);
        if (!store) {
          store = new Map();
          stores.set(name, store);
        }
        return {
          match: async (request: string | { url: string }) => store.get(key(request))?.clone(),
          put: async (request: string | { url: string }, response: Response) => {
            store.set(key(request), response.clone());
          },
        };
      },
    };
    runInNewContext(
      serviceWorkerSource(
        'paperlight-pages-v3-111111111111',
        ['/'],
        ['/assets/old-111.js'],
        ['/', '/tools/merge'],
      ),
      {
        URL,
        Set,
        Map,
        Response,
        AbortController,
        TextDecoder,
        setTimeout,
        clearTimeout,
        caches,
        self: {
          location: { origin: 'https://paperlight.test' },
          addEventListener: (type: string, handler: (event: unknown) => void) => {
            handlers[type] = handler;
          },
        },
        fetch: async (request: string | { url: string }) => {
          if (offline) throw Error('Offline');
          const path = key(request);
          if (path === '/public-assets.json')
            return new Response(
              JSON.stringify({ version: '222222222222', assets: ['/assets/new-222.js'] }),
            );
          return new Response(
            path === '/tools/merge'
              ? '<meta name="paperlight-release" content="222222222222">New merge page'
              : 'public script',
          );
        },
      },
    );
    const request = async (path: string, navigation = false) => {
      let result: Promise<Response> | undefined;
      handlers.fetch({
        request: {
          url: `https://paperlight.test${path}`,
          method: 'GET',
          mode: navigation ? 'navigate' : 'cors',
        },
        respondWith: (value: Promise<Response>) => {
          result = value;
        },
        waitUntil: (task: Promise<unknown>) => pending.push(task),
      });
      const response = await result!;
      await Promise.all(pending.splice(0));
      return response;
    };
    await request('/tools/merge', true);
    await request('/assets/new-222.js');
    await request('/assets/unlisted.js');
    expect(stores.get('paperlight-pages-v3-111111111111')?.has('/tools/merge')).toBe(false);
    expect(stores.get('paperlight-pages-v3-222222222222')?.has('/tools/merge')).toBe(true);
    expect([...stores.values()].some((store) => store.has('/assets/unlisted.js'))).toBe(false);
    offline = true;
    expect(await (await request('/tools/merge', true)).text()).toContain('New merge page');
    expect(await (await request('/assets/new-222.js')).text()).toBe('public script');
  });
  it.each(['open', 'read', 'write'] as const)(
    'serves successful responses when cache %s fails',
    async (failure) => {
      const handlers: Record<string, (event: unknown) => void> = {};
      let requests = 0;
      const response = {
        ok: true,
        status: 200,
        clone() {
          return this;
        },
      };
      const cache = {
        match: async () => {
          if (failure === 'read') throw Error('SecurityError');
        },
        put: async () => {
          if (failure === 'write') throw Error('QuotaExceededError');
        },
      };
      runInNewContext(
        serviceWorkerSource('paperlight-pages-v3-test', ['/'], ['/assets/test.js'], ['/']),
        {
          URL,
          Set,
          Map,
          self: {
            location: { origin: 'https://paperlight.test' },
            addEventListener: (type: string, handler: (event: unknown) => void) => {
              handlers[type] = handler;
            },
          },
          caches: {
            open: async () => {
              if (failure === 'open') throw Error('SecurityError');
              return cache;
            },
          },
          fetch: async () => {
            requests++;
            return response;
          },
        },
      );
      for (const path of ['/', '/assets/test.js']) {
        let result: Promise<typeof response> | undefined;
        handlers.fetch({
          request: {
            url: `https://paperlight.test${path}`,
            method: 'GET',
            mode: path === '/' ? 'navigate' : 'cors',
          },
          respondWith: (value: Promise<typeof response>) => {
            result = value;
          },
        });
        expect(await result).toBe(response);
      }
      expect(requests).toBe(2);
    },
  );
});
