// Quiet toasts anchored above the bottom nav. Confirmation, not celebration.
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface ToastItem {
  id: number;
  message: string;
  tone: "default" | "error";
}

const ToastContext = createContext<{
  toast: (message: string, tone?: "default" | "error") => void;
}>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback(
    (message: string, tone: "default" | "error" = "default") => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-2), { id, message, tone }]);
      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 2600);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        className="fixed left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-32px)] max-w-[400px] space-y-2 pointer-events-none"
        style={{ bottom: "calc(var(--bottom-nav-h) + env(safe-area-inset-bottom) + 12px)" }}
      >
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`animate-rise rounded-lg px-4 py-3 shadow-[0_4px_24px_rgba(0,0,0,0.35)] type-body-sm bg-surface-container-highest ${
              t.tone === "error" ? "text-error" : "text-on-surface"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
