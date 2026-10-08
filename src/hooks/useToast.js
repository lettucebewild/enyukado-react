import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_TOASTS = 4;
let nextId = 1;

// Stacked toasts. showToast(message, type?, { action: { label, onClick }, duration? })
//   - same message shown again replaces the old one instead of piling up
//   - toasts with an action (e.g. Undo) stay a bit longer
export function useToast() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismissToast = useCallback((id) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 280);
  }, []);

  const showToast = useCallback((message, type = 'success', opts = {}) => {
    const id = nextId++;
    const duration = opts.duration ?? (opts.action ? 6000 : 3500);
    setToasts((list) => [...list.filter((t) => t.message !== message || t.leaving), { id, message, type, action: opts.action, duration }].slice(-MAX_TOASTS));
    return id;
  }, []);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return { toasts, showToast, dismissToast };
}
