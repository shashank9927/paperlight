import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  returnFocusTo,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
  returnFocusTo?: RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className="modal-content"
          onCloseAutoFocus={(event) => {
            if (returnFocusTo?.current?.isConnected) {
              event.preventDefault();
              returnFocusTo.current.focus();
            }
          }}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          <Dialog.Close className="icon-button modal-close" aria-label="Close dialog">
            <X size={19} />
          </Dialog.Close>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
