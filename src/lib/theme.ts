export type Theme = 'dark' | 'light' | 'system';
const key = 'paperlight-theme';
export function readTheme(): Theme {
  try {
    const value = localStorage.getItem(key);
    if (value === 'light' || value === 'system') return value;
  } catch {
    /* Storage is optional. */
  }
  return 'dark';
}
export type ResolvedTheme = 'dark' | 'light';
export function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === 'system'
    ? matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
    : theme;
}
export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);
  document.documentElement.dataset.theme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#0b0c0e' : '#fafaf9');
  return resolved;
}
let transitionTimer: number | undefined;
export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(key, theme);
  } catch {
    /* Storage is optional. */
  }
  const root = document.documentElement;
  window.clearTimeout(transitionTimer);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    root.classList.add('theme-changing');
    transitionTimer = window.setTimeout(() => root.classList.remove('theme-changing'), 260);
  } else root.classList.remove('theme-changing');
  applyTheme(theme);
}
