/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useRef } from 'react';

/**
 * В5 (фідбек бізнесу 05.10, п. 3.b): таблиці реєстрів.
 *
 * 1. Шапка рухається разом із таблицею при горизонтальній прокрутці:
 *    - сітка з окремими таблицями шапки і тіла (.ui-jqgrid-hdiv + .ui-jqgrid-bdiv) — шапка синхронізується
 *      з прокруткою тіла;
 *    - сітка, де шапка і тіло в одній таблиці всередині .ui-jqgrid-hdiv, — вмикається горизонтальна прокрутка
 *      (раніше права частина таблиці обрізалась без можливості прокрутити).
 * 2. Ширина колонок змінюється перетягуванням правої межі заголовка колонки (курсор ↔ біля межі).
 *    Ширина застосовується однаково до шапки, рядка фільтрів і рядків тіла, зберігається при сортуванні,
 *    фільтрації і зміні сторінки, скидається, якщо змінився склад колонок.
 *
 * Використання: const gridRef = useGridColumns(); ... <div className="ui-jqgrid" ref={gridRef}>
 * Працює і для звичайної таблиці (thead + tbody) у контейнері з горизонтальною прокруткою.
 */

const MIN_COL_WIDTH = 40;
const EDGE_PX = 6;

type Cleanup = () => void;

const setupGrid = (root: HTMLElement): Cleanup => {
  const hdiv = root.querySelector<HTMLElement>('.ui-jqgrid-hdiv');
  const bdiv = root.querySelector<HTMLElement>('.ui-jqgrid-bdiv');

  const getHeadTable = () =>
    root.querySelector<HTMLTableElement>('table.ui-jqgrid-htable') || root.querySelector<HTMLTableElement>('table');
  const getBodyTable = () => root.querySelector<HTMLTableElement>('table.ui-jqgrid-btable');
  const getLabelRow = () => getHeadTable()?.tHead?.rows[0] || null;

  // ---------- 1. Горизонтальна прокрутка ----------
  const onBodyScroll = () => {
    if (hdiv && bdiv) hdiv.scrollLeft = bdiv.scrollLeft;
  };
  let restoreHdivOverflow: string | null = null;
  if (hdiv && bdiv) {
    bdiv.addEventListener('scroll', onBodyScroll, { passive: true });
  } else if (hdiv && !bdiv) {
    restoreHdivOverflow = hdiv.style.overflowX;
    hdiv.style.overflowX = 'auto';
  }

  // ---------- 2. Ширина колонок ----------
  let widths: number[] | null = null;
  // Початкові inline-стилі елементів, які ми змінили (щоб повернути при зміні складу колонок)
  const originals = new Map<HTMLElement, { width: string; minWidth: string; tableLayout: string }>();

  const remember = (el: HTMLElement) => {
    if (!originals.has(el)) {
      originals.set(el, { width: el.style.width, minWidth: el.style.minWidth, tableLayout: el.style.tableLayout });
    }
  };

  const resetWidths = () => {
    originals.forEach((orig, el) => {
      if (!el.isConnected) return;
      el.style.width = orig.width;
      el.style.minWidth = orig.minWidth;
      el.style.tableLayout = orig.tableLayout;
    });
    originals.clear();
    widths = null;
  };

  const applyWidths = () => {
    if (!widths) return;
    const labelRow = getLabelRow();
    if (!labelRow) return;
    if (labelRow.cells.length !== widths.length) {
      // Склад колонок змінився (наприклад, увімкнено «Показати заплановані блокування») — повертаємо початкову ширину
      resetWidths();
      return;
    }
    const total = widths.reduce((acc, w) => acc + w, 0);
    const tables = [getHeadTable(), getBodyTable()].filter((t): t is HTMLTableElement => Boolean(t));
    tables.forEach((table) => {
      remember(table);
      table.style.tableLayout = 'fixed';
      table.style.width = `${total}px`;
      table.style.minWidth = `${total}px`;
      Array.from(table.rows).forEach((row) => {
        if (row.cells.length !== widths!.length) return; // рядок «Немає записів», підсумки з colSpan тощо
        Array.from(row.cells).forEach((cell, i) => {
          remember(cell);
          cell.style.width = `${widths![i]}px`;
        });
      });
    });
    onBodyScroll();
  };

  const findEdgeCell = (e: MouseEvent): number => {
    const labelRow = getLabelRow();
    if (!labelRow) return -1;
    const target = e.target as Node;
    if (!labelRow.contains(target)) return -1;
    const cells = Array.from(labelRow.cells);
    for (let i = 0; i < cells.length; i++) {
      const rect = cells[i].getBoundingClientRect();
      if (e.clientY < rect.top || e.clientY > rect.bottom) continue;
      if (Math.abs(e.clientX - rect.right) <= EDGE_PX) return i;
    }
    return -1;
  };

  const onHover = (e: MouseEvent) => {
    if (root.classList.contains('grid-col-resizing')) return;
    root.classList.toggle('grid-col-resize-hover', findEdgeCell(e) >= 0);
  };

  const onLeave = () => root.classList.remove('grid-col-resize-hover');

  let suppressNextClick = false;
  const onClickCapture = (e: MouseEvent) => {
    if (suppressNextClick) {
      // Відпускання кнопки після перетягування межі не повинно запускати сортування колонки
      e.stopPropagation();
      e.preventDefault();
      suppressNextClick = false;
    }
  };

  const onMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const colIndex = findEdgeCell(e);
    if (colIndex < 0) return;
    e.preventDefault();
    e.stopPropagation();

    const labelRow = getLabelRow();
    if (!labelRow) return;
    if (!widths || widths.length !== labelRow.cells.length) {
      // Фіксуємо поточну фактичну ширину всіх колонок перед першою зміною
      widths = Array.from(labelRow.cells).map((c) => Math.round(c.getBoundingClientRect().width));
    }
    const startX = e.clientX;
    const startWidth = widths[colIndex];
    let moved = false;
    root.classList.add('grid-col-resizing');

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 1) moved = true;
      widths![colIndex] = Math.max(MIN_COL_WIDTH, startWidth + dx);
      applyWidths();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      root.classList.remove('grid-col-resizing');
      root.classList.remove('grid-col-resize-hover');
      if (moved) {
        suppressNextClick = true;
        // якщо click так і не прийшов (кнопку відпустили поза заголовком) — знімаємо прапорець
        setTimeout(() => {
          suppressNextClick = false;
        }, 0);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Нові рядки після сортування / фільтра / пагінації отримують ту саму ширину
  let rafId = 0;
  const observer = new MutationObserver(() => {
    if (!widths) return;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(applyWidths);
  });
  observer.observe(root, { childList: true, subtree: true });

  root.addEventListener('mousemove', onHover);
  root.addEventListener('mouseleave', onLeave);
  root.addEventListener('mousedown', onMouseDown, true);
  root.addEventListener('click', onClickCapture, true);

  return () => {
    observer.disconnect();
    cancelAnimationFrame(rafId);
    root.removeEventListener('mousemove', onHover);
    root.removeEventListener('mouseleave', onLeave);
    root.removeEventListener('mousedown', onMouseDown, true);
    root.removeEventListener('click', onClickCapture, true);
    if (bdiv) bdiv.removeEventListener('scroll', onBodyScroll);
    if (hdiv && restoreHdivOverflow !== null) hdiv.style.overflowX = restoreHdivOverflow;
  };
};

/** Повертає callback-ref для кореневого елемента сітки (працює і для сіток, що з'являються умовно, напр. у вікні). */
export const useGridColumns = () => {
  const cleanupRef = useRef<Cleanup | null>(null);
  return useCallback((el: HTMLElement | null) => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (el) cleanupRef.current = setupGrid(el);
  }, []);
};
