import React, { useState } from 'react';
import { useGridColumns } from '../utils/useGridColumns';
import { DateTimeInput } from './DateTimeInput';
import { ClientRecord, ObjectLockRecord } from '../types';
import { UNIONS_DATA, DEPTS_DATA, RSPS_DATA, ROUTES_DATA, CORPORATIONS_DATA, MANUAL_BLOCKING_REASONS } from '../data/mockData';
import { computeLockTimingState, formatToDisplayDateTime } from '../utils/lockTiming';
import { readXlsxCodes } from '../utils/readXlsxCodes';

interface MassActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  clients: ClientRecord[];
  objectLocks?: ObjectLockRecord[];
  onApplyMassAction: (
    entityType: 'clients' | 'routes' | 'rsps' | 'depts',
    selectedIds: (number | string)[],
    action: 'lock' | 'unlock',
    reason: string,
    startDateTime?: string,
    endDateTime?: string,
    totalSelectedCount?: number,
    conflictCount?: number
  ) => void;
}

export interface ConflictedItem {
  id: number | string;
  code: string;
  name: string;
  reason: string;
  periodText: string;
  lockedBy: string;
}

export const MassActionModal: React.FC<MassActionModalProps> = ({
  isOpen,
  onClose,
  clients,
  objectLocks = [],
  onApplyMassAction
}) => {
  const [activeTab, setActiveTab] = useState<'clients' | 'routes' | 'rsps' | 'depts'>('clients');
  // В5: ширина колонок у списках вкладок регулюється перетягуванням межі заголовка (як у реєстрах)
  const clientsGridRef = useGridColumns();
  const routesGridRef = useGridColumns();
  const rspsGridRef = useGridColumns();
  const deptsGridRef = useGridColumns();

  // Selection states
  const [selectedClientIds, setSelectedClientIds] = useState<number[]>([]);
  const [selectedRouteIds, setSelectedRouteIds] = useState<number[]>([]);
  const [selectedRspIds, setSelectedRspIds] = useState<number[]>([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState<number[]>([]);

  // Search filters per tab
  const [clientSearch, setClientSearch] = useState<string>('');
  const [clientUnionFilter, setClientUnionFilter] = useState<number>(0);
  const [clientCorpFilter, setClientCorpFilter] = useState<string>('all');
  const [routeSearch, setRouteSearch] = useState<string>('');
  const [rspSearch, setRspSearch] = useState<string>('');
  const [deptSearch, setDeptSearch] = useState<string>('');

  // Form states at bottom
  const [reason, setReason] = useState<string>('Блокування НКЦ');
  const [startDateTime, setStartDateTime] = useState<string>('');
  const [endDateTime, setEndDateTime] = useState<string>('');

  // Confirmation Modal state
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<'lock' | 'unlock'>('lock');
  const [conflictedItems, setConflictedItems] = useState<ConflictedItem[]>([]);
  const [nonConflictedIds, setNonConflictedIds] = useState<(number | string)[]>([]);

  const allConflicted = conflictedItems.length > 0 && nonConflictedIds.length === 0;

  // Resizing state
  const [dimensions, setDimensions] = useState({ width: 780, height: 640 });
  const [showImportModal, setShowImportModal] = useState(false);
  // Д7/Д8: обраний файл і результат імпорту (повідомлення лишається, доки його не закрили)
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{
    kind: 'ok' | 'error';
    text: string;
    notFound: string[];
  } | null>(null);

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = dimensions.width;
    const startH = dimensions.height;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newW = Math.max(620, Math.min(window.innerWidth - 30, startW + (moveEvent.clientX - startX)));
      const newH = Math.max(460, Math.min(window.innerHeight - 40, startH + (moveEvent.clientY - startY)));
      setDimensions({ width: newW, height: newH });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Д7: імпорт реально читає файл; виділяються саме об'єкти з файлу (попередній вибір у вкладці замінюється)
  const handleFileImport = async () => {
    if (!importFile) {
      setImportResult({ kind: 'error', text: 'Оберіть файл Excel (.xlsx).', notFound: [] });
      return;
    }
    setImportBusy(true);
    try {
      const raw = await readXlsxCodes(importFile);
      const norm = (v: string) => v.trim().toLowerCase();

      // Довідник поточної вкладки: id + усі значення, за якими можна знайти об'єкт (код, ID, назва)
      const catalog: { id: number; keys: string[] }[] =
        activeTab === 'clients'
          ? clients.map((c) => ({ id: c.id, keys: [c.clCode, String(c.id)] }))
          : activeTab === 'routes'
          ? ROUTES_DATA.filter((r) => r.value !== 0).map((r) => ({ id: r.value, keys: [r.label, String(r.value)] }))
          : activeTab === 'rsps'
          ? RSPS_DATA.filter((r) => r.value !== 0).map((r) => ({ id: r.value, keys: [r.label, (r as { code?: string }).code || '', String(r.value)] }))
          : DEPTS_DATA.filter((d) => d.value !== 0).map((d) => ({ id: d.value, keys: [d.label, (d as { code?: string }).code || '', String(d.value)] }));
      const index = new Map<string, number>();
      catalog.forEach((item) => item.keys.filter(Boolean).forEach((k) => index.set(norm(k), item.id)));

      let rows = raw;
      let skippedHeader = '';
      // Перший рядок без цифр, якого немає в довіднику, вважаємо заголовком колонки (напр. «Маршрут», «Код»)
      if (rows.length > 0 && !index.has(norm(rows[0])) && !/\d/.test(rows[0])) {
        skippedHeader = rows[0];
        rows = rows.slice(1);
      }

      const foundIds: number[] = [];
      const notFound: string[] = [];
      let duplicates = 0;
      rows.forEach((v) => {
        const id = index.get(norm(v));
        if (id === undefined) notFound.push(v);
        else if (!foundIds.includes(id)) foundIds.push(id);
        else duplicates += 1;
      });

      const tabLabel =
        activeTab === 'clients' ? 'клієнтів' : activeTab === 'routes' ? 'маршрутів' : activeTab === 'rsps' ? 'РСП' : 'складів';
      if (activeTab === 'clients') {
        setSelectedClientIds(foundIds);
        setClientSearch('');
        setClientUnionFilter(0);
        setClientCorpFilter('all');
      } else if (activeTab === 'routes') {
        setSelectedRouteIds(foundIds);
        setRouteSearch('');
      } else if (activeTab === 'rsps') {
        setSelectedRspIds(foundIds);
        setRspSearch('');
      } else {
        setSelectedDeptIds(foundIds);
        setDeptSearch('');
      }

      const parts = [
        `Файл «${importFile.name}»: рядків з кодами — ${rows.length}.`,
        `Знайдено і виділено ${tabLabel}: ${foundIds.length}.`,
        notFound.length > 0 ? `Не знайдено: ${notFound.length}.` : 'Усі коди з файлу знайдено.',
        duplicates > 0 ? `Повторів у файлі: ${duplicates}.` : '',
        skippedHeader ? `Перший рядок «${skippedHeader}» пропущено як заголовок.` : '',
        'Попередній вибір у вкладці замінено об\'єктами з файлу.'
      ].filter(Boolean);
      setImportResult({ kind: foundIds.length > 0 ? 'ok' : 'error', text: parts.join(' '), notFound });
    } catch (err) {
      setImportResult({ kind: 'error', text: err instanceof Error ? err.message : 'Не вдалося прочитати файл.', notFound: [] });
    } finally {
      setImportBusy(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportResult(null);
    setImportFile(null);
  };

  if (!isOpen) return null;

  // Filtered lists
  const filteredClients = clients.filter((c) => {
    if (clientUnionFilter > 0 && c.unionId !== clientUnionFilter) return false;
    if (clientCorpFilter !== 'all') {
      if (c.corpCode !== clientCorpFilter && c.corpName !== clientCorpFilter) return false;
    }
    if (clientSearch) {
      const q = clientSearch.toLowerCase();
      return (
        c.clCode.toLowerCase().includes(q) ||
        c.clName.toLowerCase().includes(q) ||
        c.corpCode.toLowerCase().includes(q) ||
        c.corpName.toLowerCase().includes(q) ||
        c.unionName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredRoutes = ROUTES_DATA.filter((r) => r.value !== 0 && (!routeSearch || r.label.toLowerCase().includes(routeSearch.toLowerCase())));
  const filteredRsps = RSPS_DATA.filter((r) => r.value !== 0 && (!rspSearch || r.label.toLowerCase().includes(rspSearch.toLowerCase())));
  const filteredDepts = DEPTS_DATA.filter((d) => d.value !== 0 && (!deptSearch || d.label.toLowerCase().includes(deptSearch.toLowerCase())));

  // Toggle selection
  const handleToggleSelectAll = () => {
    if (activeTab === 'clients') {
      if (selectedClientIds.length === filteredClients.length) {
        setSelectedClientIds([]);
      } else {
        setSelectedClientIds(filteredClients.map((c) => c.id));
      }
    } else if (activeTab === 'routes') {
      if (selectedRouteIds.length === filteredRoutes.length) {
        setSelectedRouteIds([]);
      } else {
        setSelectedRouteIds(filteredRoutes.map((r) => r.value));
      }
    } else if (activeTab === 'rsps') {
      if (selectedRspIds.length === filteredRsps.length) {
        setSelectedRspIds([]);
      } else {
        setSelectedRspIds(filteredRsps.map((r) => r.value));
      }
    } else if (activeTab === 'depts') {
      if (selectedDeptIds.length === filteredDepts.length) {
        setSelectedDeptIds([]);
      } else {
        setSelectedDeptIds(filteredDepts.map((d) => d.value));
      }
    }
  };

  const getSelectedCount = () => {
    switch (activeTab) {
      case 'clients': return selectedClientIds.length;
      case 'routes': return selectedRouteIds.length;
      case 'rsps': return selectedRspIds.length;
      case 'depts': return selectedDeptIds.length;
    }
  };

  // Helper to parse date string into timestamp
  const parseDateTimeToMs = (dateStr?: string): number | null => {
    if (!dateStr) return null;
    // Format YYYY-MM-DDTHH:mm
    if (dateStr.includes('T')) {
      const ms = Date.parse(dateStr);
      return isNaN(ms) ? null : ms;
    }
    // Format DD.MM.YYYY HH:mm or DD.MM.YYYY HH:mm:ss
    if (dateStr.includes('.')) {
      const parts = dateStr.trim().split(' ');
      const dateParts = parts[0].split('.');
      if (dateParts.length >= 3) {
        const day = parseInt(dateParts[0], 10);
        const month = parseInt(dateParts[1], 10) - 1;
        const year = parseInt(dateParts[2], 10);
        let hour = 0;
        let minute = 0;
        let second = 0;
        if (parts[1]) {
          const timeParts = parts[1].split(':');
          hour = parseInt(timeParts[0], 10) || 0;
          minute = parseInt(timeParts[1], 10) || 0;
          second = parseInt(timeParts[2], 10) || 0;
        }
        const d = new Date(year, month, day, hour, minute, second);
        return isNaN(d.getTime()) ? null : d.getTime();
      }
    }
    const fallback = Date.parse(dateStr);
    return isNaN(fallback) ? null : fallback;
  };

  // Rule of overlap between two periods: [newStart, newEnd] and [existStart, existEnd]
  // - If end is undefined/null => indefinite, extends forever.
  // - Two intervals [A, B] and [C, D] overlap iff max(A, C) < min(B, D).
  // - If either has no start, it starts now (0 or now).
  const checkPeriodsOverlap = (
    newStartStr?: string,
    newEndStr?: string,
    existStartStr?: string,
    existEndStr?: string
  ): boolean => {
    const newStart = parseDateTimeToMs(newStartStr) ?? 0;
    const newEnd = parseDateTimeToMs(newEndStr) ?? Infinity;
    const existStart = parseDateTimeToMs(existStartStr) ?? 0;
    const existEnd = parseDateTimeToMs(existEndStr) ?? Infinity;

    return Math.max(newStart, existStart) < Math.min(newEnd, existEnd);
  };

  const handleAction = (action: 'lock' | 'unlock') => {
    let ids: (number | string)[] = [];
    if (activeTab === 'clients') ids = selectedClientIds;
    else if (activeTab === 'routes') ids = selectedRouteIds;
    else if (activeTab === 'rsps') ids = selectedRspIds;
    else if (activeTab === 'depts') ids = selectedDeptIds;

    if (ids.length === 0) {
      alert('Будь ласка, оберіть хоча б один елемент зі списку.');
      return;
    }

    setPendingAction(action);

    // Calculate conflicts for 'lock' action
    if (action === 'lock') {
      const conflicts: ConflictedItem[] = [];
      const validIds: (number | string)[] = [];

      if (activeTab === 'clients') {
        ids.forEach((id) => {
          const client = clients.find((c) => c.id === Number(id));
          if (!client) return;

          // Check direct client lock or scheduled lock
          let hasConflict = false;
          let conflictReason = '';
          let conflictPeriod = '';
          let conflictUser = client.editUser || 'EDIQ';

          if (client.isBlocked || client.isScheduled) {
            // Check all client lock details
            const details = client.lockDetails && client.lockDetails.length > 0
              ? client.lockDetails
              : [{
                  source: 'Клієнт' as const,
                  reason: client.reason || 'Кредитний ліміт',
                  startDate: client.scheduledStart,
                  endDate: client.scheduledEnd,
                  isScheduled: client.isScheduled
                }];

            for (const d of details) {
              const timing = computeLockTimingState(d, new Date());
              if (timing.isExpired) continue;
              const dStart = d.startDate || (d.isScheduled ? client.scheduledStart : undefined);
              const dEnd = d.endDate || (d.isScheduled ? client.scheduledEnd : undefined);
              if (checkPeriodsOverlap(startDateTime, endDateTime, dStart, dEnd)) {
                hasConflict = true;
                conflictReason = d.reason || client.reason || 'Блокування';
                const formattedDStart = formatToDisplayDateTime(dStart);
                const formattedDEnd = formatToDisplayDateTime(dEnd);
                conflictPeriod = (formattedDStart || formattedDEnd)
                  ? `з ${formattedDStart || 'негайно'} по ${formattedDEnd || 'безстроково'}`
                  : 'Діє постійно';
                break;
              }
            }
          }

          if (hasConflict) {
            conflicts.push({
              id: client.id,
              code: client.clCode,
              name: client.clName,
              reason: conflictReason,
              periodText: conflictPeriod,
              lockedBy: conflictUser
            });
          } else {
            validIds.push(client.id);
          }
        });
      } else {
        // Other entity types (routes, rsps, depts)
        const targetType = activeTab === 'routes' ? 'Маршрут' : activeTab === 'rsps' ? 'РСП' : 'Склад';
        ids.forEach((id) => {
          const existingLock = objectLocks.find(
            (l) => l.targetType === targetType && l.targetCode === String(id)
          );

          let name = String(id);
          let code = String(id);
          if (activeTab === 'routes') {
            const found = ROUTES_DATA.find((r) => r.value === Number(id));
            if (found) name = found.label;
          } else if (activeTab === 'rsps') {
            const found = RSPS_DATA.find((r) => r.value === Number(id));
            if (found) {
              name = found.label;
              code = found.code || String(id);
            }
          } else if (activeTab === 'depts') {
            const found = DEPTS_DATA.find((d) => d.value === Number(id));
            if (found) {
              name = found.label;
              code = found.code || String(id);
            }
          }

          if (existingLock) {
            const timing = computeLockTimingState(existingLock, new Date());
            if (!timing.isExpired && checkPeriodsOverlap(startDateTime, endDateTime, existingLock.startDate, existingLock.endDate)) {
              const formattedStart = formatToDisplayDateTime(existingLock.startDate);
              const formattedEnd = formatToDisplayDateTime(existingLock.endDate);
              const periodText = (formattedStart || formattedEnd)
                ? `з ${formattedStart || 'негайно'} по ${formattedEnd || 'безстроково'}`
                : 'Діє постійно';
              conflicts.push({
                id,
                code,
                name,
                reason: existingLock.reason || 'Блокування НКЦ',
                periodText,
                lockedBy: existingLock.lockedBy || 'Оператор'
              });
              return;
            }
          }
          validIds.push(id);
        });
      }

      setConflictedItems(conflicts);
      setNonConflictedIds(validIds);
    } else {
      // unlock action: no conflicts that block, all selected ids are valid
      setConflictedItems([]);
      setNonConflictedIds(ids);
    }

    setShowConfirmModal(true);
  };

  const handleConfirmAction = () => {
    // When confirming, apply action to nonConflictedIds
    onApplyMassAction(
      activeTab,
      nonConflictedIds,
      pendingAction,
      reason,
      startDateTime,
      endDateTime,
      getSelectedCount(),
      conflictedItems.length
    );
    setShowConfirmModal(false);
    onClose();
  };

  const tableMaxHeight = Math.max(160, dimensions.height - 430);

  return (
    <>
      <div
        className="modal fade in"
        id="massActionModal"
        style={{ display: 'block', zIndex: 1055 }}
        role="dialog"
      >
        <div className="modal-dialog" style={{ width: `${dimensions.width}px`, maxWidth: '96vw', marginTop: '20px' }}>
          <div className="modal-content panel panel-primary" style={{ marginBottom: 0, position: 'relative' }}>
            <div className="modal-header panel-heading">
              <h4 className="modal-title" style={{ color: '#fff' }}>
                Масова дія — Блокування / Розблокування
              </h4>
              <button
                type="button"
                className="close"
                style={{ color: '#fff', opacity: 0.8 }}
                onClick={onClose}
              >
                ×
              </button>
            </div>

            <div className="modal-body" style={{ padding: '15px' }}>
              {/* Entity Tabs in standard flat CRM style */}
              <div style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: 12, backgroundColor: '#f5f5f5' }}>
                <button
                  type="button"
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderBottom: activeTab === 'clients' ? '2px solid #337ab7' : '2px solid transparent',
                    backgroundColor: activeTab === 'clients' ? '#fff' : 'transparent',
                    fontWeight: activeTab === 'clients' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                  onClick={() => setActiveTab('clients')}
                >
                  Клієнти ({clients.length})
                </button>
                <button
                  type="button"
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderBottom: activeTab === 'routes' ? '2px solid #337ab7' : '2px solid transparent',
                    backgroundColor: activeTab === 'routes' ? '#fff' : 'transparent',
                    fontWeight: activeTab === 'routes' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                  onClick={() => setActiveTab('routes')}
                >
                  Маршрути ({ROUTES_DATA.length - 1})
                </button>
                <button
                  type="button"
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderBottom: activeTab === 'rsps' ? '2px solid #337ab7' : '2px solid transparent',
                    backgroundColor: activeTab === 'rsps' ? '#fff' : 'transparent',
                    fontWeight: activeTab === 'rsps' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                  onClick={() => setActiveTab('rsps')}
                >
                  РСП ({RSPS_DATA.length - 1})
                </button>
                <button
                  type="button"
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderBottom: activeTab === 'depts' ? '2px solid #337ab7' : '2px solid transparent',
                    backgroundColor: activeTab === 'depts' ? '#fff' : 'transparent',
                    fontWeight: activeTab === 'depts' ? 'bold' : 'normal',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                  onClick={() => setActiveTab('depts')}
                >
                  Склади ({DEPTS_DATA.length - 1})
                </button>
              </div>

              {/* Tab 1: Clients */}
              {activeTab === 'clients' && (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Пошук клієнта за кодом, назвою, корпорацією..."
                      style={{ flex: 1.8 }}
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                    />
                    <select
                      className="form-control"
                      style={{ flex: 1.1 }}
                      value={clientUnionFilter}
                      onChange={(e) => setClientUnionFilter(Number(e.target.value))}
                    >
                      <option value={0}>Всі об'єднання</option>
                      {UNIONS_DATA.filter((u) => u.value !== 0 && !u.label.startsWith('A_')).map((u) => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
                    <select
                      className="form-control"
                      style={{ flex: 1.1 }}
                      value={clientCorpFilter}
                      onChange={(e) => setClientCorpFilter(e.target.value)}
                    >
                      {CORPORATIONS_DATA.map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-default btn-sm"
                      style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4, height: 34 }}
                      onClick={() => setShowImportModal(true)}
                      title="Імпорт списку кодів з файлу (.xlsx)"
                    >
                      <span className="glyphicon glyphicon-open"></span> Імпорт із файлу
                    </button>
                  </div>

                  <div ref={clientsGridRef} style={{ maxHeight: `${tableMaxHeight}px`, overflowY: 'auto', overflowX: 'auto', border: '1px solid #ddd', backgroundColor: '#fff' }}>
                    <table className="table table-bordered table-hover" style={{ margin: 0, fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9f9f9' }}>
                          <th style={{ width: 36, textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={filteredClients.length > 0 && selectedClientIds.length === filteredClients.length}
                              onChange={handleToggleSelectAll}
                            />
                          </th>
                          <th style={{ width: 65 }}>Код</th>
                          <th>Назва клієнта</th>
                          <th style={{ width: 140 }}>Об'єднання</th>
                          <th style={{ width: 150 }}>Корпорація</th>
                          <th style={{ width: 75, textAlign: 'center' }}>Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredClients.map((client) => {
                          const isChecked = selectedClientIds.includes(client.id);
                          return (
                            <tr
                              key={client.id}
                              onClick={() => {
                                if (isChecked) {
                                  setSelectedClientIds(selectedClientIds.filter((id) => id !== client.id));
                                } else {
                                  setSelectedClientIds([...selectedClientIds, client.id]);
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            >
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                />
                              </td>
                              <td>{client.clCode}</td>
                              <td>{client.clName}</td>
                              <td>{client.unionName || '—'}</td>
                              <td>{client.corpName || '—'}</td>
                              <td style={{ textAlign: 'center' }}>
                                {client.isBlocked ? (
                                  <span style={{ color: '#ac2925', fontWeight: 'bold' }}>Блок</span>
                                ) : (
                                  <span style={{ color: '#3e8f3e' }}>Активний</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 2: Routes */}
              {activeTab === 'routes' && (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Пошук маршруту..."
                      style={{ flex: 1 }}
                      value={routeSearch}
                      onChange={(e) => setRouteSearch(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-default btn-sm"
                      style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4, height: 34 }}
                      onClick={() => setShowImportModal(true)}
                      title="Імпорт списку маршрутів з файлу"
                    >
                      <span className="glyphicon glyphicon-open"></span> Імпорт із файлу
                    </button>
                  </div>
                  <div ref={routesGridRef} style={{ maxHeight: `${tableMaxHeight}px`, overflowY: 'auto', overflowX: 'auto', border: '1px solid #ddd', backgroundColor: '#fff' }}>
                    <table className="table table-bordered table-hover" style={{ margin: 0, fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9f9f9' }}>
                          <th style={{ width: 36, textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={filteredRoutes.length > 0 && selectedRouteIds.length === filteredRoutes.length}
                              onChange={handleToggleSelectAll}
                            />
                          </th>
                          <th>Назва маршруту</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRoutes.map((r) => {
                          const isChecked = selectedRouteIds.includes(r.value);
                          return (
                            <tr
                              key={r.value}
                              onClick={() => {
                                if (isChecked) {
                                  setSelectedRouteIds(selectedRouteIds.filter((id) => id !== r.value));
                                } else {
                                  setSelectedRouteIds([...selectedRouteIds, r.value]);
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            >
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                />
                              </td>
                              <td>{r.label}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 3: RSPs */}
              {activeTab === 'rsps' && (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Пошук РСП..."
                      style={{ flex: 1 }}
                      value={rspSearch}
                      onChange={(e) => setRspSearch(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-default btn-sm"
                      style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4, height: 34 }}
                      onClick={() => setShowImportModal(true)}
                      title="Імпорт списку РСП з файлу"
                    >
                      <span className="glyphicon glyphicon-open"></span> Імпорт із файлу
                    </button>
                  </div>
                  <div ref={rspsGridRef} style={{ maxHeight: `${tableMaxHeight}px`, overflowY: 'auto', overflowX: 'auto', border: '1px solid #ddd', backgroundColor: '#fff' }}>
                    <table className="table table-bordered table-hover" style={{ margin: 0, fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9f9f9' }}>
                          <th style={{ width: 36, textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={filteredRsps.length > 0 && selectedRspIds.length === filteredRsps.length}
                              onChange={handleToggleSelectAll}
                            />
                          </th>
                          <th>Назва РСП</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRsps.map((rsp) => {
                          const isChecked = selectedRspIds.includes(rsp.value);
                          return (
                            <tr
                              key={rsp.value}
                              onClick={() => {
                                if (isChecked) {
                                  setSelectedRspIds(selectedRspIds.filter((id) => id !== rsp.value));
                                } else {
                                  setSelectedRspIds([...selectedRspIds, rsp.value]);
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            >
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                />
                              </td>
                              <td>{rsp.label}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab 4: Depts / Warehouses */}
              {activeTab === 'depts' && (
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Пошук складу..."
                      style={{ flex: 1 }}
                      value={deptSearch}
                      onChange={(e) => setDeptSearch(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-default btn-sm"
                      style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4, height: 34 }}
                      onClick={() => setShowImportModal(true)}
                      title="Імпорт списку складів з файлу"
                    >
                      <span className="glyphicon glyphicon-open"></span> Імпорт із файлу
                    </button>
                  </div>
                  <div ref={deptsGridRef} style={{ maxHeight: `${tableMaxHeight}px`, overflowY: 'auto', overflowX: 'auto', border: '1px solid #ddd', backgroundColor: '#fff' }}>
                    <table className="table table-bordered table-hover" style={{ margin: 0, fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9f9f9' }}>
                          <th style={{ width: 36, textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={filteredDepts.length > 0 && selectedDeptIds.length === filteredDepts.length}
                              onChange={handleToggleSelectAll}
                            />
                          </th>
                          <th>Назва складу</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDepts.map((d) => {
                          const isChecked = selectedDeptIds.includes(d.value);
                          return (
                            <tr
                              key={d.value}
                              onClick={() => {
                                if (isChecked) {
                                  setSelectedDeptIds(selectedDeptIds.filter((id) => id !== d.value));
                                } else {
                                  setSelectedDeptIds([...selectedDeptIds, d.value]);
                                }
                              }}
                              style={{ cursor: 'pointer' }}
                            >
                              <td style={{ textAlign: 'center' }}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                />
                              </td>
                              <td>{d.label}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Form Controls for Action at Bottom */}
              <div style={{ marginTop: 15, padding: 12, backgroundColor: '#f9f9f9', border: '1px solid #e5e5e5' }}>
                <div className="row" style={{ marginBottom: 8 }}>
                  <div className="col-md-2" style={{ fontWeight: 'bold' }}>
                    Причина:
                  </div>
                  <div className="col-md-2" style={{ width: '80%' }}>
                    <select
                      className="form-control"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    >
                      {MANUAL_BLOCKING_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="row" style={{ marginBottom: 0 }}>
                  <div className="col-md-2" style={{ fontWeight: 'bold' }}>
                    Дата-час з:
                  </div>
                  <div className="col-md-2" style={{ width: '38%' }}>
                    <DateTimeInput
                      className="form-control"
                      value={startDateTime}
                      onChange={setStartDateTime}
                    />
                  </div>
                  <div className="col-md-1" style={{ fontWeight: 'bold', width: 'auto', paddingLeft: 10, paddingRight: 10 }}>
                    по:
                  </div>
                  <div className="col-md-2" style={{ width: '38%' }}>
                    <DateTimeInput
                      className="form-control"
                      value={endDateTime}
                      onChange={setEndDateTime}
                    />
                  </div>
                </div>
                <div style={{ fontSize: 11, color: '#777', marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <span>* Якщо період не заповнено — блокування встановлюється негайно і безстроково.</span>
                  {/* В7: очистити обидві дати одним кліком */}
                  <button
                    type="button"
                    className="btn btn-default btn-xs"
                    onClick={() => { setStartDateTime(''); setEndDateTime(''); }}
                    title="Очистити обидві дати одним кліком"
                    style={{ borderRadius: 0, fontSize: 11, padding: '2px 10px', flexShrink: 0 }}
                  >
                    Очистити
                  </button>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: '#555' }}>
                Обрано об'єктів: <strong>{getSelectedCount()}</strong>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => handleAction('lock')}
                >
                  Блокувати
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => handleAction('unlock')}
                >
                  Розблокувати
                </button>
                <button
                  type="button"
                  className="btn btn-default"
                  onClick={onClose}
                >
                  Закрити
                </button>
              </div>
            </div>

            {/* Resize Grip Handle at bottom-right corner (Requirement 2.1) */}
            <div
              onMouseDown={handleResizeMouseDown}
              style={{
                position: 'absolute',
                right: 2,
                bottom: 2,
                width: 15,
                height: 15,
                cursor: 'se-resize',
                zIndex: 10,
                opacity: 0.6,
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'flex-end',
                padding: 1
              }}
              title="Потягніть для зміни розміру вікна"
            >
              <svg width="12" height="12" viewBox="0 0 12 12">
                <line x1="11" y1="2" x2="2" y2="11" stroke="#555" strokeWidth="1.2" />
                <line x1="11" y1="6" x2="6" y2="11" stroke="#555" strokeWidth="1.2" />
                <line x1="11" y1="10" x2="10" y2="11" stroke="#555" strokeWidth="1.2" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade in" style={{ zIndex: 1050 }}></div>

      {/* Modal: Import from file (Requirement 2.7 - UI only) */}
      {showImportModal && (
        <>
          <div className="modal fade in" style={{ display: 'block', zIndex: 1060 }} role="dialog">
            <div className="modal-dialog" style={{ width: 480, marginTop: '80px' }}>
              <div className="modal-content panel panel-info" style={{ marginBottom: 0 }}>
                <div className="modal-header panel-heading">
                  <h4 className="modal-title" style={{ fontSize: 15, fontWeight: 'bold' }}>
                    Імпорт списку об'єктів з файлу
                  </h4>
                  <button
                    type="button"
                    className="close"
                    onClick={closeImportModal}
                  >
                    ×
                  </button>
                </div>
                <div className="modal-body" style={{ padding: 15 }}>
                  <p style={{ fontSize: 13, color: '#333', marginBottom: 12 }}>
                    Оберіть файл Excel (.xlsx) зі списком кодів для автоматичного виділення об'єктів у поточній вкладці:
                  </p>
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 'bold' }}>Файл для імпорту (.xlsx):</label>
                    <input
                      type="file"
                      className="form-control"
                      accept=".xlsx"
                      onChange={(e) => {
                        setImportFile(e.target.files && e.target.files[0] ? e.target.files[0] : null);
                        setImportResult(null);
                      }}
                    />
                  </div>
                  {/* Д8/В9: результат імпорту лишається, доки вікно не закрили */}
                  {importResult && (
                    <div
                      id="importResultMessage"
                      className={`alert ${importResult.kind === 'ok' ? 'alert-success' : 'alert-danger'}`}
                      style={{
                        padding: 8,
                        fontSize: 12,
                        marginBottom: 0,
                        border: '1px solid',
                        backgroundColor: importResult.kind === 'ok' ? '#dff0d8' : '#f2dede',
                        borderColor: importResult.kind === 'ok' ? '#d6e9c6' : '#ebccd1',
                        color: importResult.kind === 'ok' ? '#3c763d' : '#a94442'
                      }}
                    >
                      <div>{importResult.text}</div>
                      {importResult.notFound.length > 0 && (
                        <div style={{ marginTop: 6 }}>
                          <strong>Не знайдено в довіднику:</strong>
                          <div style={{ maxHeight: 90, overflowY: 'auto', marginTop: 2, fontFamily: 'monospace' }}>
                            {importResult.notFound.join(', ')}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: '#777', marginTop: 8 }}>
                    * Формат файлу: один код або ID об'єкта в кожному рядку файлу Excel (.xlsx).
                  </div>
                </div>
                <div className="modal-footer" style={{ padding: '8px 15px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleFileImport}
                    disabled={importBusy || !importFile}
                  >
                    {importBusy ? 'Завантаження…' : 'Завантажити та виділити'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-default btn-sm"
                    onClick={closeImportModal}
                  >
                    {importResult ? 'Закрити' : 'Скасувати'}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade in" style={{ zIndex: 1058 }}></div>
        </>
      )}

      {/* Modal: Confirmation Modal (Requirement 9b) */}
      {showConfirmModal && (
        <>
          <div
            className="modal fade in"
            id="massActionConfirmModal"
            style={{ display: 'block', zIndex: 1070 }}
            role="dialog"
          >
            <div className="modal-dialog" style={{ width: 560, marginTop: '70px', maxWidth: '95vw' }}>
              <div className="modal-content panel panel-primary" style={{ marginBottom: 0, boxShadow: '0 4px 16px rgba(0,0,0,0.3)' }}>
                <div className="modal-header panel-heading" style={{ backgroundColor: '#337ab7', color: '#fff', padding: '10px 15px' }}>
                  <button
                    type="button"
                    className="close"
                    style={{ color: '#fff', opacity: 0.8 }}
                    onClick={() => setShowConfirmModal(false)}
                  >
                    ×
                  </button>
                  <h4 className="modal-title" style={{ fontSize: 16, fontWeight: 'bold' }}>
                    Підтвердження масової дії
                  </h4>
                </div>

                <div className="modal-body" style={{ padding: '18px 20px', fontSize: 13 }}>
                  {/* Summary Block */}
                  <div style={{ backgroundColor: '#f9f9f9', border: '1px solid #e5e5e5', borderRadius: 4, padding: '12px 14px', marginBottom: 15 }}>
                    <div style={{ marginBottom: 8, display: 'flex' }}>
                      <span style={{ width: 90, color: '#666', fontWeight: 'bold' }}>Дія:</span>
                      <span style={{ fontWeight: 'bold', color: pendingAction === 'lock' ? '#c9302c' : '#449d44' }}>
                        {pendingAction === 'lock' ? 'Блокування' : 'Розблокування'}
                      </span>
                    </div>

                    <div style={{ marginBottom: 8, display: 'flex' }}>
                      <span style={{ width: 90, color: '#666', fontWeight: 'bold' }}>Об'єкти:</span>
                      <span style={{ fontWeight: 'bold', color: '#333' }}>
                        {activeTab === 'clients' ? 'Клієнти' : activeTab === 'routes' ? 'Маршрути' : activeTab === 'rsps' ? 'РСП' : 'Склади'}: {getSelectedCount()} об'єктів
                      </span>
                    </div>

                    {pendingAction === 'lock' && (
                      <div style={{ marginBottom: 8, display: 'flex' }}>
                        <span style={{ width: 90, color: '#666', fontWeight: 'bold' }}>Причина:</span>
                        <span style={{ color: '#333' }}>{reason}</span>
                      </div>
                    )}

                    <div style={{ display: 'flex' }}>
                      <span style={{ width: 90, color: '#666', fontWeight: 'bold' }}>Період:</span>
                      <span style={{ color: '#333' }}>
                        {startDateTime || endDateTime ? (
                          `з ${startDateTime ? formatToDisplayDateTime(startDateTime) : 'негайно'} по ${endDateTime ? formatToDisplayDateTime(endDateTime) : 'безстроково'}`
                        ) : (
                          'Негайно і безстроково'
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Conflict Notice & List */}
                  {conflictedItems.length > 0 && (
                    <div style={{ border: '1px solid #ebccd1', backgroundColor: '#fdf7f7', borderRadius: 4, padding: '12px 14px', marginBottom: 15 }}>
                      <div style={{ color: '#a94442', fontWeight: 'bold', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <span className="glyphicon glyphicon-warning-sign" style={{ fontSize: 14, marginTop: 1 }}></span>
                        <span>
                          Для {conflictedItems.length} об'єктів з {getSelectedCount()} обраних уже діють блокування з періодом, що перетинається. До них дію не буде застосовано.
                        </span>
                      </div>

                      {/* Scrollable list of conflicted items */}
                      <div
                        style={{
                          maxHeight: 160,
                          overflowY: 'auto',
                          border: '1px solid #e3c0c5',
                          borderRadius: 3,
                          backgroundColor: '#fff',
                          fontSize: 12
                        }}
                      >
                        <table className="table table-condensed table-striped" style={{ margin: 0 }}>
                          <thead>
                            <tr style={{ backgroundColor: '#fcf2f2', color: '#666' }}>
                              <th style={{ width: 85 }}>Код</th>
                              <th>Назва</th>
                              <th>Причина</th>
                              <th>Період дії</th>
                              <th style={{ width: 110 }}>Хто поставив</th>
                            </tr>
                          </thead>
                          <tbody>
                            {conflictedItems.map((c) => (
                              <tr key={String(c.id)}>
                                <td style={{ fontWeight: 'bold' }}>{c.code}</td>
                                <td>{c.name}</td>
                                <td>{c.reason}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>{c.periodText}</td>
                                <td style={{ color: '#555' }}>{c.lockedBy}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {allConflicted && (
                        <div style={{ color: '#c9302c', fontWeight: 'bold', marginTop: 10, fontSize: 13, textAlign: 'center' }}>
                          Дію не можна застосувати до жодного з обраних об'єктів
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="modal-footer" style={{ padding: '10px 20px', backgroundColor: '#f5f5f5', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    className={`btn ${conflictedItems.length > 0 ? 'btn-warning' : 'btn-primary'}`}
                    disabled={allConflicted}
                    onClick={handleConfirmAction}
                  >
                    {conflictedItems.length > 0
                      ? `Продовжити без конфліктних (${nonConflictedIds.length} об'єктів)`
                      : 'Підтвердити'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-default"
                    onClick={() => setShowConfirmModal(false)}
                  >
                    Скасувати
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade in" style={{ zIndex: 1065 }}></div>
        </>
      )}
    </>
  );
};
