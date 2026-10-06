/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HistoryEntry } from '../types';

/**
 * Р4 (коментар бізнесу 05.10): вікно «Історія» блокування рядка — за зразком поточного додатку.
 * Колонки: Дія, Дата, Поле, Старе значення, Нове значення; кнопка «Вихід».
 * Відкривається кнопкою «+» у рядку реєстру клієнтів і реєстрів об'єктів.
 */
interface HistoryModalProps {
  isOpen: boolean;
  title: string;
  entries: HistoryEntry[];
  onClose: () => void;
}

const cellStyle: React.CSSProperties = { border: '1px solid #333', padding: '6px 8px', fontSize: 13, verticalAlign: 'middle' };

export const HistoryModal: React.FC<HistoryModalProps> = ({ isOpen, title, entries, onClose }) => {
  if (!isOpen) return null;
  return (
    <>
      <div className="modal in" id="historyModal" role="dialog" style={{ display: 'block', zIndex: 1085 }} aria-modal="true">
        <div className="modal-dialog" role="document" style={{ width: 680, maxWidth: '95vw' }}>
          <div className="modal-content" style={{ borderRadius: 4 }}>
            <div className="modal-header" style={{ padding: '12px 20px' }}>
              <h4 className="modal-title" style={{ fontSize: 18, fontWeight: 'normal' }}>
                Історія
              </h4>
              <button type="button" className="close" onClick={onClose} title="Закрити" style={{ fontSize: 22 }}>
                <span>&times;</span>
              </button>
            </div>
            <div className="modal-body" style={{ padding: '14px 20px' }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>{title}</div>
              {entries.length === 0 ? (
                <div style={{ padding: '16px 0', color: '#888', fontSize: 13 }}>
                  Змін блокування для цього рядка ще не було.
                </div>
              ) : (
                <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#b0e0e6' }}>
                        <th style={cellStyle}>Дія</th>
                        <th style={cellStyle}>Дата</th>
                        <th style={cellStyle}>Поле</th>
                        <th style={cellStyle}>Старе значення</th>
                        <th style={cellStyle}>Нове значення</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((e, i) => (
                        <tr key={i}>
                          <td style={cellStyle}>{e.action}</td>
                          <td style={cellStyle}>{e.date}</td>
                          <td style={cellStyle}>{e.field}</td>
                          <td style={cellStyle}>{e.oldValue}</td>
                          <td style={cellStyle}>{e.newValue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ padding: '10px 20px 16px', borderTop: '1px solid #e5e5e5' }}>
              <button
                type="button"
                className="btn btn-danger"
                onClick={onClose}
                style={{ width: '100%', backgroundColor: '#d9534f', borderColor: '#d43f3a', color: '#fff', padding: '8px 0', fontSize: 14 }}
              >
                Вихід
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop in" style={{ opacity: 0.5, zIndex: 1080 }}></div>
    </>
  );
};
