import React, { useState, useEffect } from 'react';
import { DateTimeInput } from './DateTimeInput';
import { useGridColumns } from '../utils/useGridColumns';
import { ObjectLockRecord, EntityType, ClientRecord } from '../types';
import { MANUAL_BLOCKING_REASONS } from '../data/mockData';
import { computeLockTimingState, formatToDisplayDateTime, formatClockTooltip } from '../utils/lockTiming';

interface ObjectLocksPageProps {
  objectLocks: ObjectLockRecord[];
  onRemoveLock: (lockId: string) => void;
  onOpenMassAction: () => void;
  onUpdateLock?: (updatedLock: ObjectLockRecord) => void;
  onNavigateBack?: () => void;
  returnClient?: ClientRecord | null;
  initialFilterType?: string;
  initialSearchQuery?: string;
}

export const ObjectLocksPage: React.FC<ObjectLocksPageProps> = ({
  objectLocks,
  onRemoveLock,
  onOpenMassAction,
  onUpdateLock,
  onNavigateBack,
  returnClient,
  initialFilterType,
  initialSearchQuery
}) => {
  // В5: шапка рухається з таблицею при горизонтальній прокрутці, ширина колонок змінюється перетягуванням межі
  const gridRef = useGridColumns();
  const [filterType, setFilterType] = useState<string>(initialFilterType || 'all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'scheduled'>('all');
  const [searchQuery, setSearchQuery] = useState<string>(initialSearchQuery || '');

  useEffect(() => {
    if (initialFilterType) {
      setFilterType(initialFilterType);
    }
  }, [initialFilterType]);

  useEffect(() => {
    if (initialSearchQuery) {
      setSearchQuery(initialSearchQuery);
    }
  }, [initialSearchQuery]);

  // Editing scheduled lock modal state (Requirement 2.8)
  const [editingLock, setEditingLock] = useState<ObjectLockRecord | null>(null);
  const [editReason, setEditReason] = useState<string>('');
  const [editStartDate, setEditStartDate] = useState<string>('');
  const [editEndDate, setEditEndDate] = useState<string>('');

  const [columnFilters, setColumnFilters] = useState({
    targetType: '',
    targetName: '',
    status: '',
    reason: '',
    lockDate: '',
    lockedBy: '',
    period: ''
  });

  const filteredLocks = objectLocks.filter((l) => {
    const timing = computeLockTimingState(l, new Date());
    // Rule: період завершився: запис зникає зі списку запланованих і з реєстру блокувань об'єктів
    if (timing.isExpired) return false;

    if (filterType !== 'all' && l.targetType !== filterType) return false;
    
    // Status Filter (Requirement 2.8 & Ф1а)
    if (statusFilter === 'active' && !timing.isActive) return false;
    if (statusFilter === 'scheduled' && !timing.isFuture) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const match =
        l.targetName.toLowerCase().includes(q) ||
        l.targetCode.toLowerCase().includes(q) ||
        l.reason.toLowerCase().includes(q) ||
        l.lockedBy.toLowerCase().includes(q);
      if (!match) return false;
    }

    if (columnFilters.targetType && !l.targetType.toLowerCase().includes(columnFilters.targetType.toLowerCase())) return false;
    if (columnFilters.targetName && !(l.targetName + ' ' + l.targetCode).toLowerCase().includes(columnFilters.targetName.toLowerCase())) return false;
    if (columnFilters.status) {
      const lockStatusText = timing.isFuture ? 'заплановане' : 'активне';
      if (!lockStatusText.includes(columnFilters.status.toLowerCase())) return false;
    }
    if (columnFilters.reason && !l.reason.toLowerCase().includes(columnFilters.reason.toLowerCase())) return false;
    if (columnFilters.lockDate && !l.lockDate.toLowerCase().includes(columnFilters.lockDate.toLowerCase())) return false;
    if (columnFilters.lockedBy && !l.lockedBy.toLowerCase().includes(columnFilters.lockedBy.toLowerCase())) return false;

    return true;
  });

  // Export to Excel / CSV (Requirement 2.8)
  const handleExportCsv = () => {
    const headers = ['Тип об\'єкта', 'Код', 'Назва', 'Статус', 'Причина', 'Дата блокування', 'Хто встановив', 'Дата початку', 'Дата закінчення'];
    const rows = filteredLocks.map((l) => {
      const timing = computeLockTimingState(l, new Date());
      return [
        l.targetType,
        l.targetCode || '',
        `"${(l.targetName || '').replace(/"/g, '""')}"`,
        timing.isFuture ? 'Заплановане' : 'Активне',
        `"${(l.reason || '').replace(/"/g, '""')}"`,
        l.lockDate || '',
        `"${(l.lockedBy || '').replace(/"/g, '""')}"`,
        formatToDisplayDateTime(l.startDate) || '',
        formatToDisplayDateTime(l.endDate) || ''
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `reestr_blokuvanny_obiektiv_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatToInputDate = (dStr?: string) => {
    if (!dStr) return '';
    if (dStr.includes('T')) return dStr.slice(0, 16);
    const parts = dStr.trim().split(' ');
    if (parts.length >= 1) {
      const dParts = parts[0].split('.');
      if (dParts.length === 3) {
        const timePart = parts[1] ? parts[1].slice(0, 5) : '00:00';
        const year = dParts[2].length === 2 ? `20${dParts[2]}` : dParts[2];
        return `${year}-${dParts[1].padStart(2, '0')}-${dParts[0].padStart(2, '0')}T${timePart}`;
      }
    }
    return dStr;
  };

  const formatFromInputDate = (dStr?: string) => {
    if (!dStr) return undefined;
    return formatToDisplayDateTime(dStr);
  };

  const handleOpenEdit = (lock: ObjectLockRecord) => {
    setEditingLock(lock);
    const defaultManualReason = (lock.reason && (MANUAL_BLOCKING_REASONS as readonly string[]).includes(lock.reason))
      ? lock.reason
      : 'Блокування НКЦ';
    setEditReason(defaultManualReason);
    setEditStartDate(formatToInputDate(lock.startDate));
    setEditEndDate(formatToInputDate(lock.endDate));
  };

  const handleSaveEdit = () => {
    if (!editingLock) return;
    const formattedStartDate = formatFromInputDate(editStartDate);
    const formattedEndDate = formatFromInputDate(editEndDate);
    const isStillScheduled = Boolean(formattedStartDate || formattedEndDate);
    const updated: ObjectLockRecord = {
      ...editingLock,
      reason: editReason,
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      isScheduled: isStillScheduled
    };
    if (onUpdateLock) {
      onUpdateLock(updated);
    }
    setEditingLock(null);
  };

  return (
    <div id="object-locks-page" style={{ padding: '0 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, marginTop: 10 }}>
        <div style={{ minWidth: onNavigateBack ? 280 : 0 }}>
          {onNavigateBack && (
            <button
              type="button"
              className="btn btn-default btn-sm"
              onClick={onNavigateBack}
              title={returnClient ? `Назад до зміни блокування автоімпорту клієнта ${returnClient.clCode} (${returnClient.clName})` : 'До сторінки блокування автообробки'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
            >
              <span>←</span> {returnClient ? `Назад до клієнта ${returnClient.clCode}` : 'До сторінки блокування автообробки'}
            </button>
          )}
        </div>
        <div className="text-center" style={{ flex: 1 }}>
          <h2 style={{ fontFamily: 'fantasy', margin: '0 0 4px 0' }}>
            Реєстр блокувань об'єктів (Маршрути, РСП, Склади, Об'єднання)
          </h2>
        </div>
        <div style={{ minWidth: onNavigateBack ? 280 : 0 }}></div>
      </div>

      {/* Top Filter Panel in exact CRM style */}
      <div
        id="tbl_object_filter"
        style={{
          backgroundColor: '#fbfbfb',
          border: '1px solid #ddd',
          padding: '12px 15px',
          marginBottom: 15,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 10
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 'bold' }}>Тип:</div>
          <select
            className="form-control"
            style={{ width: '160px' }}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">Всі типи об'єктів</option>
            <option value="Маршрут">Маршрути</option>
            <option value="РСП">РСП</option>
            <option value="Склад">Склади</option>
            <option value="Об'єднання">Об'єднання</option>
          </select>

          <div style={{ fontWeight: 'bold' }}>Статус:</div>
          <select
            className="form-control"
            style={{ width: '160px' }}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            <option value="all">Всі статуси</option>
            <option value="active">Тільки активні</option>
            <option value="scheduled">Тільки заплановані</option>
          </select>

          <div style={{ fontWeight: 'bold' }}>Пошук:</div>
          <input
            type="text"
            className="form-control"
            placeholder="Назва, код або причина..."
            style={{ width: '220px' }}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-default"
            onClick={handleExportCsv}
            title="Експортувати поточний реєстр у CSV/Excel"
          >
            <span className="glyphicon glyphicon-download-alt" style={{ marginRight: 5 }}></span>
            Експорт у файл
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenMassAction}
          >
            Масова дія / Нове блокування
          </button>
        </div>
      </div>

      {/* Table jqGrid style */}
      <div ref={gridRef} className="ui-jqgrid" id="gbox_objectLocks" dir="ltr" style={{ width: '100%' }}>
        <div className="ui-jqgrid-view table-responsive" role="grid" id="gview_objectLocks" style={{ width: '100%' }}>
          <div className="ui-jqgrid-hdiv" style={{ width: '100%' }}>
            <div className="ui-jqgrid-hbox">
              <table className="ui-jqgrid-htable ui-common-table table table-bordered" style={{ width: '100%' }}>
                <thead>
                  <tr className="ui-jqgrid-labels" role="row">
                    <th style={{ width: '110px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Тип об'єкта</div>
                    </th>
                    <th style={{ width: '240px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Назва об'єкта</div>
                    </th>
                    <th style={{ width: '110px', textAlign: 'center' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Статус</div>
                    </th>
                    <th style={{ width: '200px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Причина блокування</div>
                    </th>
                    <th style={{ width: '140px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Дата постановки</div>
                    </th>
                    <th style={{ width: '170px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Хто поставив</div>
                    </th>
                    <th style={{ width: '200px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Період дії / Заплановано</div>
                    </th>
                    <th style={{ width: '150px', textAlign: 'center' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Дія</div>
                    </th>
                  </tr>

                  {/* Inline column filters */}
                  <tr className="ui-search-toolbar" role="row">
                    <th>
                      <table className="ui-search-table">
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                value={columnFilters.targetType}
                                onChange={(e) => setColumnFilters({ ...columnFilters, targetType: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => setColumnFilters({ ...columnFilters, targetType: '' })}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th>
                      <table className="ui-search-table">
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                value={columnFilters.targetName}
                                onChange={(e) => setColumnFilters({ ...columnFilters, targetName: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => setColumnFilters({ ...columnFilters, targetName: '' })}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th>
                      <table className="ui-search-table">
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                value={columnFilters.status}
                                onChange={(e) => setColumnFilters({ ...columnFilters, status: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => setColumnFilters({ ...columnFilters, status: '' })}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th>
                      <table className="ui-search-table">
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                value={columnFilters.reason}
                                onChange={(e) => setColumnFilters({ ...columnFilters, reason: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => setColumnFilters({ ...columnFilters, reason: '' })}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th>
                      <table className="ui-search-table">
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                value={columnFilters.lockDate}
                                onChange={(e) => setColumnFilters({ ...columnFilters, lockDate: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => setColumnFilters({ ...columnFilters, lockDate: '' })}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th>
                      <table className="ui-search-table">
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                value={columnFilters.lockedBy}
                                onChange={(e) => setColumnFilters({ ...columnFilters, lockedBy: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => setColumnFilters({ ...columnFilters, lockedBy: '' })}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th>
                      <div></div>
                    </th>
                    <th>
                      <div></div>
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredLocks.map((lock) => {
                    const timing = computeLockTimingState(lock, new Date());
                    return (
                      <tr key={lock.id} className="jqgrow ui-row-ltr">
                        <td>
                          <span
                            style={{
                              fontWeight: 'bold',
                              color:
                                lock.targetType === 'Маршрут'
                                  ? '#337ab7'
                                  : lock.targetType === 'РСП'
                                  ? '#269abc'
                                  : lock.targetType === 'Склад'
                                  ? '#8a6d3b'
                                  : '#a94442'
                            }}
                          >
                            {lock.targetType}
                          </span>
                        </td>
                        <td>
                          <strong>{lock.targetName}</strong>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {timing.isFuture ? (
                            <span
                              className="label"
                              style={{
                                backgroundColor: '#fff3cd',
                                color: '#856404',
                                border: '1px solid #ffeeba',
                                padding: '3px 6px',
                                borderRadius: '3px',
                                fontSize: '11px',
                                fontWeight: 'bold'
                              }}
                            >
                              Заплановане
                            </span>
                          ) : (
                            <span
                              className="label"
                              style={{
                                backgroundColor: '#f2dede',
                                color: '#a94442',
                                border: '1px solid #ebccd1',
                                padding: '3px 6px',
                                borderRadius: '3px',
                                fontSize: '11px',
                                fontWeight: 'bold'
                              }}
                            >
                              Активне
                            </span>
                          )}
                        </td>
                        <td>{lock.reason}</td>
                        <td>{lock.lockDate}</td>
                        <td>{lock.lockedBy}</td>
                        <td>
                          {timing.isFuture ? (
                            <span
                              style={{ color: '#a06000', fontWeight: 'bold' }}
                              title={formatClockTooltip(false, lock.startDate, lock.endDate)}
                            >
                              ⏱ {formatToDisplayDateTime(lock.startDate) || 'майбутній час'} {lock.endDate ? `— ${formatToDisplayDateTime(lock.endDate)}` : ''}
                            </span>
                          ) : lock.startDate || lock.endDate ? (
                            <span title={lock.isScheduled ? formatClockTooltip(true, lock.startDate, lock.endDate) : undefined}>
                              {lock.isScheduled ? '⏱ ' : ''}{formatToDisplayDateTime(lock.startDate) || '—'} — {formatToDisplayDateTime(lock.endDate) || 'безстроково'}
                            </span>
                          ) : (
                            <span style={{ color: '#666' }}>Діє постійно</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: 4 }}>
                            {lock.isScheduled && (
                              <button
                                type="button"
                                className="btn btn-warning btn-xs"
                                style={{ padding: '2px 6px', fontSize: 11 }}
                                onClick={() => handleOpenEdit(lock)}
                                title="Редагувати розклад або причину"
                              >
                                Редагувати
                              </button>
                            )}
                            <button
                              type="button"
                              className="btn btn-danger btn-xs"
                              style={{ padding: '2px 6px', fontSize: 11 }}
                              onClick={() => onRemoveLock(lock.id)}
                              title={timing.isFuture ? 'Скасувати заплановане блокування' : 'Зняти активне блокування'}
                            >
                              {timing.isFuture ? 'Скасувати' : 'Зняти блок'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredLocks.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                        Немає блокувань об'єктів за обраними критеріями
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Scheduled Lock Modal (Requirement 2.8) */}
      {editingLock && (
        <>
          <div className="modal fade in" style={{ display: 'block', zIndex: 1060 }} role="dialog">
            <div className="modal-dialog" style={{ width: 500, marginTop: '80px' }}>
              <div className="modal-content panel panel-warning" style={{ marginBottom: 0 }}>
                <div className="modal-header panel-heading">
                  <h4 className="modal-title" style={{ fontSize: 15, fontWeight: 'bold' }}>
                    Редагування запланованого блокування
                  </h4>
                  <button
                    type="button"
                    className="close"
                    onClick={() => setEditingLock(null)}
                  >
                    ×
                  </button>
                </div>
                <div className="modal-body" style={{ padding: 15 }}>
                  <div style={{ marginBottom: 12 }}>
                    <strong>Об'єкт: </strong>
                    <span className="label label-info" style={{ marginRight: 6 }}>{editingLock.targetType}</span>
                    <span>{editingLock.targetName}</span>
                  </div>

                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, fontWeight: 'bold' }}>Причина блокування:</label>
                    <select
                      className="form-control"
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                    >
                      {MANUAL_BLOCKING_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="row" style={{ marginBottom: 10 }}>
                    <div className="col-xs-6">
                      <label style={{ fontSize: 12, fontWeight: 'bold' }}>Дата-час з:</label>
                      <DateTimeInput
                        className="form-control"
                        value={editStartDate}
                        onChange={setEditStartDate}
                      />
                    </div>
                    <div className="col-xs-6">
                      <label style={{ fontSize: 12, fontWeight: 'bold' }}>Дата-час по:</label>
                      <DateTimeInput
                        className="form-control"
                        value={editEndDate}
                        onChange={setEditEndDate}
                      />
                    </div>
                    {/* В7: очистити обидві дати одним кліком */}
                    <div className="col-xs-12" style={{ textAlign: 'right', marginTop: 6 }}>
                      <button
                        type="button"
                        className="btn btn-default btn-xs"
                        onClick={() => { setEditStartDate(''); setEditEndDate(''); }}
                        title="Очистити обидві дати одним кліком"
                        style={{ borderRadius: 0, fontSize: 11, padding: '2px 10px' }}
                      >
                        Очистити
                      </button>
                    </div>
                  </div>
                </div>
                <div className="modal-footer" style={{ padding: '10px 15px', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleSaveEdit}
                  >
                    Зберегти зміни
                  </button>
                  <button
                    type="button"
                    className="btn btn-default btn-sm"
                    onClick={() => setEditingLock(null)}
                  >
                    Скасувати
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade in" style={{ zIndex: 1058 }}></div>
        </>
      )}
    </div>
  );
};
