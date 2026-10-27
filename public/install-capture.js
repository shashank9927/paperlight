// This small same-origin script runs before the app bundle so an early browser
// install event is not lost while the interface is loading. Nothing is stored.
window.__havisuInstall = { prompt: undefined, installed: false };
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  window.__havisuInstall.prompt = event;
  window.dispatchEvent(new Event('havisu-install-change'));
});
window.addEventListener('appinstalled', () => {
  window.__havisuInstall.prompt = undefined;
  window.__havisuInstall.installed = true;
  window.dispatchEvent(new Event('havisu-install-change'));
});
