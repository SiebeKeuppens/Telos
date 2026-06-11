import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

/** Mobile-first sheet: top-rounded xl corners, grab handle, real shadow (one
 * of the few true overlays), swipe-down or backdrop tap to dismiss. */
export function BottomSheet({ open, onClose, title, children }: BottomSheetProps) {
  const startY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // Move focus into the dialog; restore it on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center animate-fade"
      style={{ background: "color-mix(in srgb, black 55%, transparent)" }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => {
          startY.current = e.touches[0].clientY;
        }}
        onTouchMove={(e) => {
          if (startY.current === null || !sheetRef.current) return;
          const delta = e.touches[0].clientY - startY.current;
          if (delta > 0) sheetRef.current.style.transform = `translateY(${delta}px)`;
        }}
        onTouchEnd={(e) => {
          if (startY.current === null || !sheetRef.current) return;
          const delta = e.changedTouches[0].clientY - startY.current;
          sheetRef.current.style.transform = "";
          startY.current = null;
          if (delta > 80) onClose();
        }}
        className="w-full max-w-[560px] bg-surface-container-highest rounded-t-xl shadow-[0_-8px_32px_rgba(0,0,0,0.4)] animate-sheet-up safe-bottom"
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-1 rounded-full bg-outline-variant" />
        </div>
        {title && (
          <div className="px-4 pt-1 pb-2">
            <h2 className="type-title text-on-surface">{title}</h2>
          </div>
        )}
        <div className="px-4 pb-6 max-h-[70dvh] overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
