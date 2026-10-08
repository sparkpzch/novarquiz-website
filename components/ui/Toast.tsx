'use client';

import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: ToastType = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 left-4 right-4 z-100 flex flex-col gap-2 sm:bottom-auto sm:top-4 sm:left-auto sm:right-4 sm:w-auto sm:items-end">
        <AnimatePresence>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onRemove(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onRemove]);

  const styles = {
    success: { bar: 'bg-emerald-500', bg: 'bg-white border-emerald-200', icon: 'bg-emerald-100 text-emerald-600', text: 'text-[#1B2530]' },
    error:   { bar: 'bg-red-500',     bg: 'bg-white border-red-200',     icon: 'bg-red-100 text-red-600',     text: 'text-[#1B2530]' },
    info:    { bar: 'bg-blue-500',    bg: 'bg-white border-blue-200',    icon: 'bg-blue-100 text-blue-600',   text: 'text-[#1B2530]' },
  };

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
  };

  const s = styles[toast.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 16, scale: 0.96 }}
      className={`relative overflow-hidden flex items-center gap-3 rounded-xl border px-4 py-3.5 shadow-xl w-full sm:min-w-[320px] sm:max-w-sm ${s.bg}`}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${s.bar}`} />
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${s.icon}`}>
        {icons[toast.type]}
      </span>
      <span className={`text-sm font-semibold flex-1 leading-snug ${s.text}`}>{toast.message}</span>
      <button onClick={() => onRemove(toast.id)} className="shrink-0 text-[#9BAFC6] hover:text-[#1B2530] transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </motion.div>
  );
}
