import { useEffect, useRef, useState, type ReactNode } from 'react';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  title?: string;
  /** destruktive Aktion: abgesetzt am Ende, rot */
  danger?: boolean;
}

/** Knopf mit aufklappender Liste; schließt bei Auswahl, Klick daneben und Esc. */
export function Menu({ label, items }: { label: ReactNode; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    root.current?.querySelector<HTMLButtonElement>('.menu-item:not(:disabled)')?.focus();
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  const normal = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);
  const render = (i: MenuItem) => (
    <button
      key={i.label}
      role="menuitem"
      className={`menu-item ${i.danger ? 'menu-item-danger' : ''}`}
      disabled={i.disabled}
      title={i.title}
      onClick={() => {
        setOpen(false);
        i.onSelect();
      }}
    >
      {i.label}
    </button>
  );

  return (
    <div className="menu" ref={root}>
      <button
        className={`btn ${open ? 'btn-active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {label}
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {normal.map(render)}
          {danger.length > 0 && <div className="menu-sep" role="separator" />}
          {danger.map(render)}
        </div>
      )}
    </div>
  );
}
