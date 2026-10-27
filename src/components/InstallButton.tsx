import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import { Modal } from './Modal';
import {
  getInstallMode,
  getServerInstallMode,
  requestInstall,
  subscribeInstall,
} from '../lib/install';

export function InstallButton() {
  const mode = useSyncExternalStore(subscribeInstall, getInstallMode, getServerInstallMode);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (mode !== 'ios' && mode !== 'mac' && mode !== 'manual') setOpen(false);
  }, [mode]);
  if (mode === 'unavailable') return null;
  return (
    <>
      <button
        ref={button}
        type="button"
        className="button secondary install-button"
        aria-label="Install Havisu PDF"
        onClick={() => (mode === 'prompt' ? requestInstall() : setOpen(true))}
      >
        <Download size={17} aria-hidden="true" />
        <span className="install-label">Install</span>
      </button>
      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          requestAnimationFrame(() => button.current?.focus());
        }}
        title={
          mode === 'ios'
            ? 'Add Havisu PDF to your Home Screen'
            : mode === 'mac'
              ? 'Add Havisu PDF to your Dock'
              : 'Install Havisu PDF'
        }
        description={
          mode === 'ios'
            ? 'Install from your browser’s Share menu.'
            : mode === 'mac'
              ? 'Use Safari on macOS Sonoma or later.'
              : 'You can use your browser’s menu to install.'
        }
      >
        {mode === 'ios' ? (
          <>
            <ol className="install-steps">
              <li>
                Tap the <strong>Share</strong> button in your browser.
              </li>
              <li>
                Choose <strong>Add to Home Screen</strong>, then tap <strong>Add</strong>.
              </li>
            </ol>
            <p>If you don’t see that option, open this page in Safari and try again.</p>
          </>
        ) : mode === 'mac' ? (
          <ol className="install-steps">
            <li>
              In Safari, open the <strong>File</strong> menu.
            </li>
            <li>
              Choose <strong>Add to Dock</strong>, then select <strong>Add</strong>.
            </li>
          </ol>
        ) : (
          <p>
            Open your browser’s menu and choose <strong>Install app</strong> or{' '}
            <strong>Add to Home Screen</strong>, if available.
          </p>
        )}
        <p>
          Open a tool in the installed app while online before using it offline. Your documents stay
          on your device.
        </p>
      </Modal>
    </>
  );
}
