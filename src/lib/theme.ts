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
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme =
    theme === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;
}
export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(key, theme);
  } catch {
    /* Storage is optional. */
  }
  applyTheme(theme);
}
