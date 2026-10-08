import { useEffect, useRef, useState } from 'react';

const SWIPE_DISMISS = 90;

function ToastItem({ toast, onDismiss }) {
  const { id, message, type, action, duration, leaving } = toast;
  const isError = type === 'error';
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef(null);
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const timer = useRef(null);
  const paused = useRef(false);

  const run = () => {
    clearTimeout(timer.current);
    startedAt.current = Date.now();
    timer.current = setTimeout(() => onDismiss(id), remaining.current);
  };
  const pause = () => {
    if (paused.current) return;
    paused.current = true;
    clearTimeout(timer.current);
    remaining.current -= Date.now() - startedAt.current;
  };
  const resume = () => {
    if (!paused.current) return;
    paused.current = false;
    run();
  };

  useEffect(() => { run(); return () => clearTimeout(timer.current); }, []); // eslint-disable-line

  const onPointerDown = (e) => {
    if (e.target.closest('button')) return;
    start.current = e.clientX;
    setDragging(true);
    pause();
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    if (start.current == null) return;
    setDx(Math.max(0, e.clientX - start.current)); // only swipe to the right
  };
  const onPointerUp = () => {
    if (start.current == null) return;
    start.current = null;
    setDragging(false);
    if (dx > SWIPE_DISMISS) onDismiss(id);
    else { setDx(0); resume(); }
  };

  return (
    <div
      className={`toast-item${isError ? ' error' : ''}${leaving ? ' leaving' : ''}${dragging ? ' dragging' : ''}`}
      style={{ '--dx': `${dx}px`, '--fade': Math.max(0.2, 1 - dx / 220) }}
      role={isError ? 'alert' : 'status'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onMouseEnter={pause}
      onMouseLeave={() => { if (start.current == null) resume(); }}
    >
      <svg className="toast-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isError ? '#f19a96' : '#9fe0bd'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {isError ? (<><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12.5" /><line x1="12" y1="16" x2="12.01" y2="16" /></>) : (<polyline points="20 6 9 17 4 12" />)}
      </svg>
      <span className="toast-msg">{message}</span>
      {action && (
        <button type="button" className="toast-action" onClick={() => { action.onClick?.(); onDismiss(id); }}>{action.label}</button>
      )}
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => onDismiss(id)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  );
}

// Stack of toasts, newest at the bottom. Swipe right (or tap x) to dismiss.
export default function Toast({ toasts = [], onDismiss }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}
