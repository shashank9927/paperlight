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
  return resolved;
}
export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(key, theme);
  } catch {
    /* Storage is optional. */
  }
  applyTheme(theme);
}
