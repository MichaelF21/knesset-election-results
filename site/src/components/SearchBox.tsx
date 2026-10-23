import { useMemo, useRef, useState } from 'react';
import { he } from '../i18n/he';
import type { Model } from '../lib/model';
import { makeIndex, search } from '../lib/search';
import type { Level, Selection } from '../lib/types';

interface Item {
  key: string;
  label: string;
  detail?: string;
  level: Level;
  id: string;
}

export function SearchBox({ model, onSelect }: { model: Model; onSelect: (s: Selection) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = 'search-results';
  const inputRef = useRef<HTMLInputElement>(null);

  const index = useMemo(() => {
    const items: Item[] = [];
    const r = model.r26 ?? model.r25;
    const locs = { ...model.r25.localities, ...r.localities };
    for (const u of Object.values(locs)) items.push({ key: `l${u.id}`, label: u.name, level: 'locality', id: u.id });
    const munis = { ...model.r25.municipalities, ...r.municipalities };
    for (const u of Object.values(munis)) {
      if (u.kind === 'regional') items.push({ key: `m${u.id}`, label: u.name, level: 'municipality', id: u.id });
    }
    return makeIndex(items);
  }, [model]);

  const hits = useMemo(() => search(index, q), [index, q]);

  const choose = (it: Item) => {
    onSelect({ level: it.level, id: it.id, fly: true });
    setQ(it.label);
    setOpen(false);
  };

  return (
    <div className="search" role="search">
      <label htmlFor="search-input" className="sr-only">
        {he.search.label}
      </label>
      <input
        ref={inputRef}
        id="search-input"
        type="search"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && hits[active] ? `sr-${hits[active].key}` : undefined}
        placeholder={he.search.placeholder}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, hits.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && hits[active]) {
            e.preventDefault();
            choose(hits[active]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
      />
      {open && q && (
        <ul id={listId} role="listbox" className="search-list">
          {hits.length === 0 && <li className="muted">{he.search.none}</li>}
          {hits.map((h, i) => (
            <li
              key={h.key}
              id={`sr-${h.key}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'active' : ''}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(h);
              }}
            >
              {h.label}
              <span className="muted small"> · {h.level === 'municipality' ? he.levels.municipality : he.levels.locality}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
