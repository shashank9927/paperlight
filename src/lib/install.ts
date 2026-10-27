type InstallPrompt = Event & { prompt(): Promise<{ outcome?: string } | void> };
type InstallWindow = Window & { __havisuInstall?: { prompt?: InstallPrompt; installed: boolean } };
export type InstallMode = 'unavailable' | 'prompt' | 'ios' | 'mac' | 'manual';

let mode: InstallMode = 'unavailable';
let prompt: InstallPrompt | undefined;
let installed = false;
let manual = false;
let initialized = false;
const listeners = new Set<() => void>();

export const subscribeInstall = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
export const getInstallMode = () => mode;
export const getServerInstallMode = (): InstallMode => 'unavailable';

function update() {
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safariVersion = navigator.userAgent.match(/Version\/(\d+).*Safari\//);
  const macSafari =
    !ios &&
    /Macintosh/.test(navigator.userAgent) &&
    !!safariVersion &&
    Number(safariVersion[1]) >= 17 &&
    !/Chrome|Chromium|CriOS|Edg|OPR|FxiOS/.test(navigator.userAgent);
  let next: InstallMode = 'unavailable';
  if (!installed && !standalone) {
    if (prompt) next = 'prompt';
    else if (ios) next = 'ios';
    else if (macSafari) next = 'mac';
    else if (manual) next = 'manual';
  }
  if (next !== mode) {
    mode = next;
    listeners.forEach((listener) => listener());
  }
}

// Installability can be reported before React mounts, so capture it at startup.
export function initializeInstall() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  const display = window.matchMedia('(display-mode: standalone)');
  display.addEventListener?.('change', update);
  const state = (window as InstallWindow).__havisuInstall;
  if (state) {
    const sync = () => {
      prompt = state.prompt;
      installed = state.installed;
      update();
    };
    window.addEventListener('havisu-install-change', sync);
    sync();
  } else {
    // If the optional bootstrap was unavailable, the app still works and can
    // capture install events that arrive after the interface starts.
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      prompt = event as InstallPrompt;
      update();
    });
    window.addEventListener('appinstalled', () => {
      installed = true;
      prompt = undefined;
      update();
    });
  }
  update();
}

export function requestInstall() {
  const current = prompt;
  if (!current) return;
  prompt = undefined;
  const state = (window as InstallWindow).__havisuInstall;
  if (state) state.prompt = undefined;
  // The event is single-use and prompt() must run in the click's user gesture.
  try {
    void current
      .prompt()
      .then((result) => {
        if (result?.outcome === 'dismissed') manual = true;
        update();
      })
      .catch(() => {
        manual = true;
        update();
      });
  } catch {
    manual = true;
    update();
  }
}
