import { useEffect, useId, useRef, useState } from 'react';
import './SortDropdown.css';

// Custom dropdown that replaces the native <select> for "Sort by".
// Keyboard: Enter/Space/Arrows open, Up/Down/Home/End move, Enter picks, Esc closes.
export default function SortDropdown({ value, onChange, options, label = 'Sort by' }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const listId = useId();

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const openMenu = () => { setHi(selectedIndex); setOpen(true); };
  const pick = (i) => { onChange(options[i].value); setOpen(false); btnRef.current?.focus(); };

  const onKeyDown = (e) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openMenu(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + options.length) % options.length); }
    else if (e.key === 'Home') { e.preventDefault(); setHi(0); }
    else if (e.key === 'End') { e.preventDefault(); setHi(options.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(hi); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className="sort-control">
      <span className="sort-label" id={`${listId}-label`}>{label}</span>
      <div className={`sd${open ? ' open' : ''}`} ref={wrapRef}>
        <button
          ref={btnRef}
          type="button"
          className="sd-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-labelledby={`${listId}-label`}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onKeyDown}
        >
          <span>{selected.label}</span>
          <svg className="sd-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </button>

        <ul className="sd-menu" role="listbox" id={listId} aria-labelledby={`${listId}-label`} tabIndex={-1}>
          {options.map((o, i) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`sd-option${o.value === value ? ' selected' : ''}${i === hi ? ' hi' : ''}`}
              onPointerEnter={() => setHi(i)}
              onClick={() => pick(i)}
            >
              <span>{o.label}</span>
              <svg className="sd-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
