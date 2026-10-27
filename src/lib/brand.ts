export const brand = {
  name: 'Havisu',
  productName: 'Havisu PDF',
  origin: 'https://pdf.havisu.com',
  legacyHost: 'paperlight-kappa.vercel.app',
  downloadPrefix: 'havisu-pdf',
  red: '#E63323',
} as const;

// Original brush-inspired geometry. Shared by the interface, icons and exports.
export const markPaths = [
  {
    tone: 'ink',
    d: 'M43 12C60 21 66 38 59 60C54 79 43 96 40 113C37 129 43 142 53 151C35 145 25 132 25 115C24 95 38 74 45 53C51 34 50 23 43 12Z',
  },
  {
    tone: 'soft',
    d: 'M122 16C108 30 104 48 103 69C102 94 103 119 117 146C100 139 92 120 89 99C86 78 88 56 96 40C102 29 112 21 122 16Z',
  },
  {
    tone: 'ink',
    detail: true,
    d: 'M25 117C23 132 32 146 47 153C34 149 23 139 22 126ZM41 52C37 69 27 86 23 98C25 82 35 63 41 52Z',
  },
  {
    tone: 'soft',
    detail: true,
    d: 'M106 115C109 130 116 141 122 148C114 143 107 131 104 119ZM111 26L127 14L116 27ZM87 83L86 107L84 98Z',
  },
  {
    tone: 'accent',
    d: 'M23 86C48 78 73 68 100 54C117 46 132 43 148 43C129 49 112 58 96 68L53 94C39 102 29 111 24 124C18 116 17 102 23 86Z',
  },
  {
    tone: 'accent',
    detail: true,
    d: 'M104 52C121 43 136 40 153 40C135 43 120 47 104 54ZM139 48L150 45L146 48ZM20 99L16 113L18 102Z',
  },
] as const;

export type LogoVariant = 'light' | 'dark' | 'adaptive';
export function legacyPageRedirect(
  host: string | undefined,
  requestPath: string,
  publicPaths: readonly string[],
) {
  if (host?.toLowerCase().split(':')[0] !== brand.legacyHost) return undefined;
  const url = new URL(requestPath, `https://${brand.legacyHost}`);
  const path =
    url.pathname === '/index.html'
      ? '/'
      : url.pathname === '/'
        ? '/'
        : url.pathname.replace(/(?:\/index\.html|\.html|\/)$/, '');
  return publicPaths.includes(path) ? `${brand.origin}${path}${url.search}` : undefined;
}
export function markSvg({
  variant = 'light',
  simple = false,
  tile = false,
}: { variant?: LogoVariant; simple?: boolean; tile?: boolean } = {}) {
  const ink = variant === 'dark' ? '#F1F0EE' : '#171717';
  const soft = variant === 'dark' ? '#A3A3A3' : '#626262';
  const styles =
    variant === 'adaptive' && !tile
      ? '<style>@media(prefers-color-scheme:dark){.ink{fill:#F1F0EE}.soft{fill:#A3A3A3}}</style>'
      : '';
  const paths = markPaths
    .filter((path) => !simple || !('detail' in path))
    .map(
      (path) =>
        `<path class="${path.tone}" fill="${path.tone === 'accent' ? brand.red : path.tone === 'ink' ? ink : soft}" d="${path.d}"/>`,
    )
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><title>Havisu</title>${styles}${tile ? '<rect width="160" height="160" rx="28" fill="#FAFAF8"/>' : ''}<g${tile ? ' transform="translate(14 12) scale(.84)"' : ''}>${paths}</g></svg>`;
}
