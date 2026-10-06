/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useRef, useState } from 'react';

/**
 * В8 (фідбек бізнесу 05.10, побажання): діалогове вікно можна перетягувати по екрану за заголовок.
 *
 * Використання:
 *   const drag = useDraggableDialog();
 *   <div className="modal-dialog" style={{ ...drag.dialogStyle }}>
 *     <div className="modal-header" onMouseDown={drag.onHeaderMouseDown} style={{ cursor: 'move' }}>
 * Кліки по кнопках у заголовку (×) не починають перетягування. reset() повертає вікно на місце
 * (викликається при кожному відкритті, якщо компонент вікна не монтується заново).
 */
export const useDraggableDialog = () => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  const onHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, a, input, select')) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const start = { ...offsetRef.current };

    const onMove = (ev: MouseEvent) => {
      setOffset({ x: start.x + (ev.clientX - startX), y: start.y + (ev.clientY - startY) });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
    };
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  const reset = useCallback(() => setOffset({ x: 0, y: 0 }), []);

  return {
    reset,
    dialogStyle: { transform: `translate(${offset.x}px, ${offset.y}px)` } as React.CSSProperties,
    onHeaderMouseDown
  };
};
