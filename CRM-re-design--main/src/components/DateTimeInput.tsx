/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * В6 (фідбек бізнесу 05.10): поле дати й часу з календарем і кнопкою «ОК».
 *
 * Замінює стандартне поле браузера type="datetime-local", у якому календар закривався тільки кліком повз нього.
 * - значення (value / onChange) у тому ж форматі, що й раніше: «РРРР-ММ-ДДTгг:хх» або порожній рядок;
 * - у полі дата показується у форматі «дд.мм.рррр гг:хх» (Д10) і її можна ввести з клавіатури;
 * - у календарі обирається день і час, «ОК» фіксує вибір і закриває календар, «Очистити» — очищає поле;
 *   Esc закриває без змін; клік повз календар зберігає обране (як і стандартне поле раніше).
 */

interface DateTimeInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}

const MONTHS_UA = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
];
const WEEKDAYS_UA = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

const pad = (n: number) => String(n).padStart(2, '0');

interface Parts {
  y: number;
  m: number; // 0-11
  d: number;
  hh: number;
  mi: number;
}

const parseIso = (v: string): Parts | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(v || '');
  if (!m) return null;
  return { y: +m[1], m: +m[2] - 1, d: +m[3], hh: +m[4], mi: +m[5] };
};

const toIso = (p: Parts) => `${p.y}-${pad(p.m + 1)}-${pad(p.d)}T${pad(p.hh)}:${pad(p.mi)}`;
const toDisplay = (p: Parts | null) => (p ? `${pad(p.d)}.${pad(p.m + 1)}.${p.y} ${pad(p.hh)}:${pad(p.mi)}` : '');

/** Розбір введеного вручну тексту «дд.мм.рррр гг:хх» (час необов'язковий). */
const parseTyped = (text: string): Parts | null => {
  const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?\s*$/.exec(text);
  if (!m) return null;
  const p: Parts = { d: +m[1], m: +m[2] - 1, y: +m[3], hh: m[4] ? +m[4] : 0, mi: m[5] ? +m[5] : 0 };
  const check = new Date(p.y, p.m, p.d, p.hh, p.mi);
  if (check.getFullYear() !== p.y || check.getMonth() !== p.m || check.getDate() !== p.d || p.hh > 23 || p.mi > 59) {
    return null;
  }
  return p;
};

export const DateTimeInput: React.FC<DateTimeInputProps> = ({
  value,
  onChange,
  className = 'form-control',
  style,
  title,
  placeholder = 'дд.мм.рррр гг:хх',
  disabled = false,
  id
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const hoursRef = useRef<HTMLDivElement>(null);
  const minutesRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string>(toDisplay(parseIso(value)));
  const [draft, setDraft] = useState<Parts | null>(null);
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Зовнішня зміна значення (наприклад, кнопка «Очистити» біля пари полів)
  useEffect(() => {
    if (!open) setText(toDisplay(parseIso(value)));
  }, [value, open]);

  const updatePosition = () => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const popupH = popupRef.current?.offsetHeight || 300;
    const popupW = popupRef.current?.offsetWidth || 360;
    const below = r.bottom + 2;
    const top = below + popupH > window.innerHeight && r.top - popupH - 2 > 0 ? r.top - popupH - 2 : below;
    const left = Math.max(4, Math.min(r.left, window.innerWidth - popupW - 4));
    setPos({ top, left });
  };

  const openPicker = () => {
    if (disabled || open) return;
    const current = parseIso(value);
    const now = new Date();
    setDraft(current);
    setView(current ? { y: current.y, m: current.m } : { y: now.getFullYear(), m: now.getMonth() });
    setOpen(true);
  };

  const commit = (p: Parts | null) => {
    onChange(p ? toIso(p) : '');
    setText(toDisplay(p));
    setOpen(false);
  };

  // Позиція календаря (fixed — щоб не обрізався вікном «Масова дія» чи модальним вікном)
  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const onWin = () => updatePosition();
    window.addEventListener('resize', onWin);
    window.addEventListener('scroll', onWin, true);
    return () => {
      window.removeEventListener('resize', onWin);
      window.removeEventListener('scroll', onWin, true);
    };
  }, [open]);

  // Прокрутити списки годин і хвилин до обраного значення
  useEffect(() => {
    if (!open) return;
    const h = draft?.hh ?? 0;
    const mi = draft?.mi ?? 0;
    const hEl = hoursRef.current?.children[h] as HTMLElement | undefined;
    const mEl = minutesRef.current?.children[mi] as HTMLElement | undefined;
    if (hEl && hoursRef.current) hoursRef.current.scrollTop = hEl.offsetTop - 70;
    if (mEl && minutesRef.current) minutesRef.current.scrollTop = mEl.offsetTop - 70;
    // тільки при відкритті
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Клік повз календар — зберегти обране і закрити; Esc — закрити без змін
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popupRef.current?.contains(t) || inputRef.current?.contains(t)) return;
      const typed = parseTyped(text);
      if (draft) commit(draft);
      else if (typed) commit(typed);
      else if (!text.trim()) commit(null);
      else setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setText(toDisplay(parseIso(value)));
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
    };
  });

  const handleTyping = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = e.target.value;
    setText(t);
    const p = parseTyped(t);
    if (p) {
      setDraft(p);
      setView({ y: p.y, m: p.m });
    } else if (!t.trim()) {
      setDraft(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const p = parseTyped(text);
      if (p) commit(p);
      else if (!text.trim()) commit(null);
    }
  };

  const handleBlur = () => {
    if (open) return; // календар відкритий — рішення приймає «ОК» або клік повз календар
    const p = parseTyped(text);
    if (p) onChange(toIso(p));
    else if (!text.trim()) onChange('');
    else setText(toDisplay(parseIso(value))); // некоректний текст — повертаємо попереднє значення
  };

  const pickDay = (y: number, m: number, d: number) => {
    const base = draft || { y, m, d, hh: 0, mi: 0 };
    const p = { ...base, y, m, d };
    setDraft(p);
    setText(toDisplay(p));
  };

  const pickTime = (part: 'hh' | 'mi', n: number) => {
    const now = new Date();
    const base = draft || { y: view.y, m: view.m, d: view.y === now.getFullYear() && view.m === now.getMonth() ? now.getDate() : 1, hh: 0, mi: 0 };
    const p = { ...base, [part]: n } as Parts;
    setDraft(p);
    setText(toDisplay(p));
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  // Сітка днів: 6 тижнів, тиждень з понеділка
  const first = new Date(view.y, view.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const days: { y: number; m: number; d: number; other: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(view.y, view.m, 1 - offset + i);
    days.push({ y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate(), other: dt.getMonth() !== view.m });
  }
  const today = new Date();

  const keepFocus = (e: React.MouseEvent) => e.preventDefault(); // не втрачати фокус поля при кліках у календарі

  const listItem = (selected: boolean): React.CSSProperties => ({
    padding: '3px 0',
    textAlign: 'center',
    cursor: 'pointer',
    fontSize: 12,
    backgroundColor: selected ? '#337ab7' : 'transparent',
    color: selected ? '#fff' : '#333',
    fontWeight: selected ? 'bold' : 'normal'
  });

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="text"
        className={className}
        value={text}
        placeholder={placeholder}
        title={title}
        disabled={disabled}
        onFocus={openPicker}
        onClick={openPicker}
        onChange={handleTyping}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        autoComplete="off"
        style={{ cursor: disabled ? 'not-allowed' : 'pointer', ...style }}
      />
      {/* Календар рендериться в document.body (portal): position: fixed не залежить від transform
          батьківського вікна (вікна можна перетягувати, В8) і не обрізається overflow */}
      {open && createPortal(
        <div
          ref={popupRef}
          className="dt-picker"
          role="dialog"
          aria-label="Вибір дати і часу"
          onMouseDown={keepFocus}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            zIndex: 2000,
            backgroundColor: '#fff',
            border: '1px solid #bbb',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            fontSize: 12,
            color: '#333',
            userSelect: 'none'
          }}
        >
          <div style={{ display: 'flex' }}>
            {/* Календар */}
            <div style={{ padding: 8, width: 238 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <button type="button" className="btn btn-default btn-xs" onClick={() => shiftMonth(-1)} title="Попередній місяць" style={{ borderRadius: 0 }}>
                  ‹
                </button>
                <strong style={{ fontSize: 13 }}>
                  {MONTHS_UA[view.m]} {view.y}
                </strong>
                <button type="button" className="btn btn-default btn-xs" onClick={() => shiftMonth(1)} title="Наступний місяць" style={{ borderRadius: 0 }}>
                  ›
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, textAlign: 'center' }}>
                {WEEKDAYS_UA.map((w) => (
                  <div key={w} style={{ fontWeight: 'bold', color: '#777', padding: '2px 0' }}>
                    {w}
                  </div>
                ))}
                {days.map((day) => {
                  const selected = Boolean(draft && draft.y === day.y && draft.m === day.m && draft.d === day.d);
                  const isToday = today.getFullYear() === day.y && today.getMonth() === day.m && today.getDate() === day.d;
                  return (
                    <div
                      key={`${day.y}-${day.m}-${day.d}`}
                      onClick={() => {
                        pickDay(day.y, day.m, day.d);
                        if (day.other) setView({ y: day.y, m: day.m });
                      }}
                      style={{
                        padding: '4px 0',
                        cursor: 'pointer',
                        backgroundColor: selected ? '#337ab7' : 'transparent',
                        color: selected ? '#fff' : day.other ? '#bbb' : '#333',
                        fontWeight: selected || isToday ? 'bold' : 'normal',
                        border: isToday && !selected ? '1px solid #337ab7' : '1px solid transparent'
                      }}
                    >
                      {day.d}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Час: години і хвилини */}
            <div style={{ display: 'flex', borderLeft: '1px solid #eee' }}>
              <div style={{ width: 44 }}>
                <div style={{ textAlign: 'center', fontWeight: 'bold', color: '#777', padding: '8px 0 4px' }}>гг</div>
                <div ref={hoursRef} style={{ height: 196, overflowY: 'auto' }}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <div key={h} onClick={() => pickTime('hh', h)} style={listItem(draft?.hh === h && Boolean(draft))}>
                      {pad(h)}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ width: 44, borderLeft: '1px solid #f2f2f2' }}>
                <div style={{ textAlign: 'center', fontWeight: 'bold', color: '#777', padding: '8px 0 4px' }}>хх</div>
                <div ref={minutesRef} style={{ height: 196, overflowY: 'auto' }}>
                  {Array.from({ length: 60 }, (_, mi) => (
                    <div key={mi} onClick={() => pickTime('mi', mi)} style={listItem(draft?.mi === mi && Boolean(draft))}>
                      {pad(mi)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Кнопки */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '6px 8px',
              borderTop: '1px solid #eee',
              backgroundColor: '#f7f7f7'
            }}
          >
            <button
              type="button"
              className="btn btn-default btn-xs"
              onClick={() => commit(null)}
              title="Очистити це поле"
              style={{ borderRadius: 0, padding: '2px 10px' }}
            >
              Очистити
            </button>
            <button
              type="button"
              className="btn btn-primary btn-xs dt-picker-ok"
              onClick={() => commit(draft)}
              title="Зафіксувати обрану дату і час"
              style={{ borderRadius: 0, padding: '2px 18px', fontWeight: 'bold' }}
            >
              ОК
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
