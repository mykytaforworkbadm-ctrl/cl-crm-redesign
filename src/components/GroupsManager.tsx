/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { GroupKind, ObjectGroup } from '../types';
import { parseDateStringToMs } from '../utils/lockTiming';

/**
 * Р1 (коментар бізнесу 05.10, п. 1.a–1.c, 2): управління групами об'єктів у «Масова дія».
 * Група — імпортований список об'єктів одного типу (назва = ім'я файлу).
 * - реєстр груп вкладки: назва, кількість, статус блоку, початок / кінець, дата змін, хто змінив;
 * - дії: «Склад» (окреме вікно), «Обрати» (фільтр і вибір групи в масовій дії), «Експорт» (копіювання / .csv),
 *   «Оновити з файлу», «Видалити»;
 * - склад групи редагується до початку блокування групи; після початку — тільки перегляд і експорт.
 */

export interface CatalogItem {
  id: number;
  code: string;
  name: string;
}

export interface MemberState {
  status: 'active' | 'future' | 'none';
}

interface GroupsManagerProps {
  kind: GroupKind;
  kindLabel: string; // «Маршрути», «РСП» …
  groups: ObjectGroup[];
  catalog: CatalogItem[];
  memberState: (id: number) => MemberState;
  onClose: () => void;
  onSelectGroup: (g: ObjectGroup) => void;
  onReimport: (g: ObjectGroup) => void;
  onDelete: (g: ObjectGroup) => void;
  onSaveComposition: (g: ObjectGroup, memberIds: number[]) => void;
}

/** Склад групи можна змінювати, поки блокування групи не почалось. */
export const isGroupEditable = (g: ObjectGroup, now: Date = new Date()): boolean => {
  if (g.lastAction !== 'lock' || !g.lockFrom) return true;
  const from = parseDateStringToMs(g.lockFrom);
  return from === null ? false : now.getTime() < from;
};

export const groupStatus = (g: ObjectGroup, memberState: (id: number) => MemberState): string => {
  if (g.memberIds.length === 0) return 'Ні';
  const st = g.memberIds.map((id) => memberState(id).status);
  if (st.every((x) => x === 'active')) return 'Так';
  if (st.every((x) => x === 'future')) return 'Заплановано';
  if (st.every((x) => x === 'none')) return 'Ні';
  return 'Частково';
};

const exportGroup = (g: ObjectGroup, catalog: CatalogItem[], mode: 'copy' | 'csv') => {
  const items = g.memberIds.map((id) => catalog.find((c) => c.id === id)).filter((c): c is CatalogItem => Boolean(c));
  if (mode === 'copy') {
    const text = items.map((c) => c.code).join('\n');
    if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => undefined);
    return items.length;
  }
  const sameCodeName = items.every((c) => c.code === c.name);
  const csv = (sameCodeName
    ? ['Назва', ...items.map((c) => c.name)]
    : ['Код;Назва', ...items.map((c) => `${c.code};${c.name.replace(/;/g, ',')}`)]
  ).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${g.name}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return items.length;
};

const th: React.CSSProperties = { padding: '6px 8px', fontSize: 12, backgroundColor: '#f2f2f2', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '5px 8px', fontSize: 12, verticalAlign: 'middle' };

export const GroupsManager: React.FC<GroupsManagerProps> = ({
  kind,
  kindLabel,
  groups,
  catalog,
  memberState,
  onClose,
  onSelectGroup,
  onReimport,
  onDelete,
  onSaveComposition
}) => {
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [draft, setDraft] = useState<number[]>([]);
  const [addId, setAddId] = useState<string>('');
  const [notice, setNotice] = useState<string | null>(null);

  const openGroup = groups.find((g) => g.id === openGroupId) || null;
  const editable = openGroup ? isGroupEditable(openGroup) : false;
  const nameOf = (id: number) => catalog.find((c) => c.id === id);
  const singleCol = catalog.length > 0 && catalog.every((c) => c.code === c.name); // маршрути: код = назва

  const statusBadge = (status: string) => {
    const color = status === 'Так' ? '#a94442' : status === 'Заплановано' ? '#8a6d3b' : status === 'Частково' ? '#6f42c1' : '#2e6b30';
    return (
      <span style={{ fontWeight: 'bold', color }}>
        {status}
        {status === 'Заплановано' && ' ⏱'}
      </span>
    );
  };

  return (
    <>
      {/* Реєстр груп вкладки */}
      <div className="modal in" id="groupsManagerModal" role="dialog" style={{ display: 'block', zIndex: 1070 }} aria-modal="true">
        <div className="modal-dialog" role="document" style={{ width: 960, maxWidth: '96vw', marginTop: 50 }}>
          <div className="modal-content" style={{ borderRadius: 0, border: '1px solid #999' }}>
            <div className="modal-header" style={{ backgroundColor: '#337ab7', color: '#fff', padding: '10px 15px' }}>
              <h4 className="modal-title" style={{ fontSize: 14, fontWeight: 'bold' }}>
                Групи: {kindLabel}
              </h4>
              <button type="button" className="close" onClick={onClose} style={{ color: '#fff', opacity: 0.8, fontSize: 20 }}>
                <span>&times;</span>
              </button>
            </div>
            <div className="modal-body" style={{ padding: 15 }}>
              {notice && (
                <div style={{ padding: '6px 10px', marginBottom: 10, fontSize: 12, backgroundColor: '#dff0d8', border: '1px solid #d6e9c6', color: '#3c763d' }}>
                  {notice}
                </div>
              )}
              {groups.length === 0 ? (
                <div style={{ color: '#777', fontSize: 13, padding: '10px 0' }}>
                  Груп ще немає. Група створюється імпортом файлу (кнопка «Імпорт із файлу»): назва групи — ім'я файлу.
                </div>
              ) : (
                <table className="table table-bordered" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={th}>Назва групи</th>
                      <th style={{ ...th, textAlign: 'center' }}>Об'єктів</th>
                      <th style={{ ...th, textAlign: 'center' }}>Статус блоку</th>
                      <th style={th}>Початок</th>
                      <th style={th}>Кінець</th>
                      <th style={th}>Дата змін</th>
                      <th style={th}>Змінив</th>
                      <th style={th}>Дії</th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={g.id}>
                        <td style={{ ...td, fontWeight: 'bold' }}>{g.name}</td>
                        <td style={{ ...td, textAlign: 'center' }}>{g.memberIds.length}</td>
                        <td style={{ ...td, textAlign: 'center' }}>{statusBadge(groupStatus(g, memberState))}</td>
                        <td style={td}>{g.lastAction === 'lock' ? g.lockFrom || '—' : '—'}</td>
                        <td style={td}>{g.lastAction === 'lock' ? g.lockTo || 'безстроково' : '—'}</td>
                        <td style={td}>{g.editedAt}</td>
                        <td style={td}>{g.editedBy}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn btn-default btn-xs"
                              onClick={() => {
                                setOpenGroupId(g.id);
                                setDraft(g.memberIds);
                                setAddId('');
                              }}
                            >
                              Склад
                            </button>
                            <button type="button" className="btn btn-primary btn-xs" onClick={() => onSelectGroup(g)} title="Відфільтрувати і виділити групу в «Масова дія»">
                              Обрати
                            </button>
                            <button
                              type="button"
                              className="btn btn-default btn-xs"
                              onClick={() => {
                                const n = exportGroup(g, catalog, 'copy');
                                setNotice(`Список групи «${g.name}» (${n}) скопійовано в буфер обміну.`);
                              }}
                              title="Скопіювати коди об'єктів групи (по одному в рядку)"
                            >
                              Копіювати
                            </button>
                            <button type="button" className="btn btn-default btn-xs" onClick={() => exportGroup(g, catalog, 'csv')} title="Експорт списку групи у файл .csv">
                              Експорт
                            </button>
                            <button type="button" className="btn btn-default btn-xs" onClick={() => onReimport(g)} title="Замінити склад групи списком із нового файлу">
                              Оновити з файлу
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-xs"
                              onClick={() => {
                                if (window.confirm(`Видалити групу «${g.name}»? Блокування об'єктів не змінюються.`)) onDelete(g);
                              }}
                            >
                              Видалити
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="modal-footer" style={{ padding: '8px 15px', backgroundColor: '#f5f5f5' }}>
              <button type="button" className="btn btn-default btn-sm" onClick={onClose}>
                Закрити
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop in" style={{ opacity: 0.3, zIndex: 1065 }}></div>

      {/* Склад групи — окреме вікно */}
      {openGroup && (
        <>
          <div className="modal in" id="groupCompositionModal" role="dialog" style={{ display: 'block', zIndex: 1080 }} aria-modal="true">
            <div className="modal-dialog" role="document" style={{ width: 620, maxWidth: '95vw', marginTop: 70 }}>
              <div className="modal-content" style={{ borderRadius: 0, border: '1px solid #999' }}>
                <div className="modal-header" style={{ backgroundColor: '#337ab7', color: '#fff', padding: '10px 15px' }}>
                  <h4 className="modal-title" style={{ fontSize: 14, fontWeight: 'bold' }}>
                    Склад групи «{openGroup.name}» — {draft.length}
                  </h4>
                  <button type="button" className="close" onClick={() => setOpenGroupId(null)} style={{ color: '#fff', opacity: 0.8, fontSize: 20 }}>
                    <span>&times;</span>
                  </button>
                </div>
                <div className="modal-body" style={{ padding: 15 }}>
                  {!editable && (
                    <div style={{ padding: '6px 10px', marginBottom: 10, fontSize: 12, backgroundColor: '#fcf8e3', border: '1px solid #faebcc', color: '#8a6d3b' }}>
                      Блокування групи вже почалось ({openGroup.lockFrom}) — склад не редагується. Доступні перегляд і експорт.
                    </div>
                  )}
                  {editable && openGroup.lastAction === 'lock' && (
                    <div style={{ padding: '6px 10px', marginBottom: 10, fontSize: 12, backgroundColor: '#d9edf7', border: '1px solid #bce8f1', color: '#31708f' }}>
                      Для групи заплановано блокування з {openGroup.lockFrom}. Додані об'єкти отримають це блокування, прибрані — втратять його.
                    </div>
                  )}
                  <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #ddd' }}>
                    <table className="table table-condensed" style={{ margin: 0 }}>
                      <thead>
                        <tr>
                          {!singleCol && <th style={th}>Код</th>}
                          <th style={th}>Назва</th>
                          {editable && <th style={{ ...th, width: 40 }}></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {draft.map((id) => {
                          const item = nameOf(id);
                          return (
                            <tr key={id}>
                              {!singleCol && <td style={td}>{item?.code || id}</td>}
                              <td style={td}>{item?.name || '—'}</td>
                              {editable && (
                                <td style={{ ...td, textAlign: 'center' }}>
                                  <button
                                    type="button"
                                    className="btn btn-default btn-xs"
                                    title="Прибрати з групи"
                                    onClick={() => setDraft(draft.filter((x) => x !== id))}
                                  >
                                    ×
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {editable && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <select className="form-control input-sm" value={addId} onChange={(e) => setAddId(e.target.value)} style={{ flex: 1 }}>
                        <option value="">Додати об'єкт до групи…</option>
                        {catalog
                          .filter((c) => !draft.includes(c.id))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code === c.name ? c.name : `${c.code} — ${c.name}`}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        className="btn btn-default btn-sm"
                        disabled={!addId}
                        onClick={() => {
                          setDraft([...draft, Number(addId)]);
                          setAddId('');
                        }}
                      >
                        Додати
                      </button>
                    </div>
                  )}
                </div>
                <div className="modal-footer" style={{ padding: '8px 15px', backgroundColor: '#f5f5f5', display: 'flex', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-default btn-sm" onClick={() => exportGroup({ ...openGroup, memberIds: draft }, catalog, 'copy')}>
                      Копіювати список
                    </button>
                    <button type="button" className="btn btn-default btn-sm" onClick={() => exportGroup({ ...openGroup, memberIds: draft }, catalog, 'csv')}>
                      Експорт .csv
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-default btn-sm" onClick={() => setOpenGroupId(null)}>
                      {editable ? 'Скасувати' : 'Закрити'}
                    </button>
                    {editable && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          onSaveComposition(openGroup, draft);
                          setNotice(`Склад групи «${openGroup.name}» збережено: ${draft.length} об'єктів.`);
                          setOpenGroupId(null);
                        }}
                      >
                        Зберегти склад
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop in" style={{ opacity: 0.3, zIndex: 1075 }}></div>
        </>
      )}
    </>
  );
};
