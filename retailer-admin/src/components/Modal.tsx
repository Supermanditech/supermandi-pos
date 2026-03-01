// T-091: Shared reusable Modal component for retailer-admin
// Extracted from ProtectedLayout session warning + logout confirm modals
// CSS classes defined in index.css (.modal-overlay, .modal-card, etc.)

import { useEffect, useRef } from 'react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children, actions }: ModalProps) {
  // STG-321: Ref for focus trap
  const modalRef = useRef<HTMLDivElement>(null);

  // #184.25: Escape key dismisses modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // STG-321: Move focus into modal on open, restore on close
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    modalRef.current?.focus();
    return () => { previousFocus?.focus(); };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={modalRef}
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="modal-title" className="modal-title">{title}</h3>
        {children}
        {actions && <div>{actions}</div>}
      </div>
    </div>
  );
}
