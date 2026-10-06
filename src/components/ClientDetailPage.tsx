import React, { useState, useEffect, useMemo } from 'react';
import { DateTimeInput } from './DateTimeInput';
import { useGridColumns } from '../utils/useGridColumns';
import { useDraggableDialog } from '../utils/useDraggableDialog';
import { ClientRecord, LockDetail, ObjectLockRecord, QueueOrder, QueueColumnFilters } from '../types';
import { MANUAL_BLOCKING_REASONS, RSPS_DATA, DEPTS_DATA, ROUTES_DATA } from '../data/mockData';
import { computeLockTimingState, pickPrimaryLock } from '../utils/lockTiming';

interface ClientDetailPageProps {
  client: ClientRecord;
  objectLocks?: ObjectLockRecord[];
  allOrders?: QueueOrder[];
  onSaveClientLock: (
    clientId: number,
    isBlocked: boolean,
    reason: string,
    startDateTime?: string,
    endDateTime?: string
  ) => void;
  onUpdateOrders?: (updatedOrders: QueueOrder[]) => void;
  onNavigateBack: () => void;
  onNavigateToObjectLocks?: (entityType?: string, entityName?: string) => void;
}

export const ClientDetailPage: React.FC<ClientDetailPageProps> = ({
  client,
  objectLocks = [],
  allOrders = [],
  onSaveClientLock,
  onUpdateOrders,
  onNavigateBack,
  onNavigateToObjectLocks
}) => {
  // В5: шапка рухається з таблицею при горизонтальній прокрутці, ширина колонок змінюється перетягуванням межі
  const gridRef = useGridColumns();
  // В8: вікно «Зміна блокування автоімпорту клієнта» перетягується за заголовок
  const drag = useDraggableDialog();
  // ----------------------------------------------------
  // Top Section: Client Lock State
  // ----------------------------------------------------
  const [isBlocked, setIsBlocked] = useState<boolean>(client.isBlocked);
  const [reason, setReason] = useState<string>('');
  const [startDateTime, setStartDateTime] = useState<string>('');
  const [endDateTime, setEndDateTime] = useState<string>('');
  // Р2: «Інші діючі блокування» згорнуті за замовчуванням; буфер — окреме вікно
  const [showOtherLocks, setShowOtherLocks] = useState<boolean>(false);
  const [isBufferOpen, setIsBufferOpen] = useState<boolean>(false);
  const [isBufferMaximized, setIsBufferMaximized] = useState<boolean>(false);

  // Власне блокування клієнта (джерело «Клієнт»). Блокування об'єднання, РСП, маршруту, складу
  // показуються окремо в «Інші діючі блокування» і в цій формі не редагуються (принцип прямих дій).
  // основне власне блокування (діюче, інакше найближче заплановане) — саме його редагує вікно
  const directLock = pickPrimaryLock<LockDetail>((client.lockDetails || []).filter((d) => d.source === 'Клієнт'));

  // Sync state when client prop changes
  useEffect(() => {
    // Р2-фікс: форма показує тільки власне блокування клієнта. Раніше «Заблокований» брався із загального
    // статусу клієнта, а період — з блокування РСП/маршруту, і збереження записувало чужий період клієнту.
    setIsBlocked(Boolean(directLock));

    const clientDirectDetail = directLock;
    const sDate = clientDirectDetail?.startDate || '';
    const eDate = clientDirectDetail?.endDate || '';

    const candidateReason = clientDirectDetail?.reason;

    if (candidateReason && (MANUAL_BLOCKING_REASONS as readonly string[]).includes(candidateReason)) {
      setReason(candidateReason);
    } else {
      setReason('Блокування НКЦ');
    }

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

    setStartDateTime(formatToInputDate(sDate));
    setEndDateTime(formatToInputDate(eDate));
    // Р2: форма ініціалізується при відкритті вікна для клієнта. Щохвилинний перерахунок статусів
    // (імітація планувальника) створює новий об'єкт client і раніше скидав незбережені правки у формі.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  // Handle Save
  const handleSave = () => {
    // Conflict Alert (порівняння з власним блокуванням клієнта, а не із загальним статусом)
    if (isBlocked && directLock && directLock.reason && reason !== directLock.reason) {
      if (
        !window.confirm(
          `Увага! Для клієнта вже встановлено блокування: "${directLock.reason}".\n\nЗбереження оновить причину та параметри блокування. Продовжити?`
        )
      ) {
        return;
      }
    } else if (isBlocked && directLock && computeLockTimingState(directLock).isFuture && !startDateTime) {
      if (
        !window.confirm(
          `Увага! Для клієнта заплановано блокування за розкладом.\n\nВстановлення негайного блокування скасує розклад. Продовжити?`
        )
      ) {
        return;
      }
    } else if (!isBlocked && !directLock) {
      if (!window.confirm(`Увага! Власного блокування клієнта немає.\n\nБажаєте підтвердити операцію?`)) {
        return;
      }
    }

    onSaveClientLock(
      client.id,
      isBlocked,
      isBlocked ? reason || 'Блокування НКЦ' : '',
      isBlocked ? startDateTime : undefined,
      isBlocked ? endDateTime : undefined
    );

    // Р2: після збереження вікно закривається, повернення в реєстр на рядок клієнта
    onNavigateBack();
  };

  // Helper to determine status of related hierarchical objects
  const getObjectStatus = (type: 'Об\'єднання' | 'РСП' | 'Маршрут' | 'Склад') => {
    let name = '';
    let isLocked = false;
    let lockReason = '';
    let lockDate = '';

    if (type === 'Об\'єднання') {
      name = client.unionName || 'Не прив\'язано';
      if (client.unionName) {
        const found = pickPrimaryLock<ObjectLockRecord>(
          objectLocks.filter(
          (o) =>
            o.targetType === 'Об\'єднання' &&
            (o.targetName === client.unionName || (client.unionId && o.targetCode === String(client.unionId)))
        )
        );
        if (found) {
          const timing = computeLockTimingState(found, new Date());
          if (timing.isActive) {
            isLocked = true;
            lockReason = found.reason;
            lockDate = found.lockDate;
          }
        } else {
          const detail = client.lockDetails?.find((d) => d.source === 'Об\'єднання');
          if (detail) {
            const timing = computeLockTimingState(detail, new Date());
            if (timing.isActive) {
              isLocked = true;
              lockReason = detail.reason;
            }
          }
        }
      }
    } else if (type === 'РСП') {
      name = client.rspName || (client.rspId ? RSPS_DATA.find((r) => r.value === client.rspId)?.label || 'Не призначено' : 'Не призначено');
      if (client.rspName || client.rspId) {
        const found = pickPrimaryLock<ObjectLockRecord>(
          objectLocks.filter(
          (o) =>
            o.targetType === 'РСП' &&
            (o.targetName === client.rspName || (client.rspId && o.targetCode === String(client.rspId)))
        )
        );
        if (found) {
          const timing = computeLockTimingState(found, new Date());
          if (timing.isActive) {
            isLocked = true;
            lockReason = found.reason;
            lockDate = found.lockDate;
          }
        } else {
          const detail = client.lockDetails?.find((d) => d.source === 'РСП');
          if (detail) {
            const timing = computeLockTimingState(detail, new Date());
            if (timing.isActive) {
              isLocked = true;
              lockReason = detail.reason;
            }
          }
        }
      }
    } else if (type === 'Маршрут') {
      name = client.routeName || (client.routeId ? ROUTES_DATA.find((r) => r.value === client.routeId)?.label || 'Не призначено' : 'Не призначено');
      if (client.routeName || client.routeId) {
        const found = pickPrimaryLock<ObjectLockRecord>(
          objectLocks.filter(
          (o) =>
            o.targetType === 'Маршрут' &&
            (o.targetName === client.routeName || (client.routeId && o.targetCode === String(client.routeId)))
        )
        );
        if (found) {
          const timing = computeLockTimingState(found, new Date());
          if (timing.isActive) {
            isLocked = true;
            lockReason = found.reason;
            lockDate = found.lockDate;
          }
        } else {
          const detail = client.lockDetails?.find((d) => d.source === 'Маршрут');
          if (detail) {
            const timing = computeLockTimingState(detail, new Date());
            if (timing.isActive) {
              isLocked = true;
              lockReason = detail.reason;
            }
          }
        }
      }
    } else if (type === 'Склад') {
      name = client.deptName || (client.deptId ? DEPTS_DATA.find((d) => d.value === client.deptId)?.label || 'Не призначено' : 'Не призначено');
      if (client.deptName || client.deptId) {
        const found = pickPrimaryLock<ObjectLockRecord>(
          objectLocks.filter(
          (o) =>
            o.targetType === 'Склад' &&
            (o.targetName === client.deptName || (client.deptId && o.targetCode === String(client.deptId)))
        )
        );
        if (found) {
          const timing = computeLockTimingState(found, new Date());
          if (timing.isActive) {
            isLocked = true;
            lockReason = found.reason;
            lockDate = found.lockDate;
          }
        } else {
          const detail = client.lockDetails?.find((d) => d.source === 'Склад');
          if (detail) {
            const timing = computeLockTimingState(detail, new Date());
            if (timing.isActive) {
              isLocked = true;
              lockReason = detail.reason;
            }
          }
        }
      }
    }

    return { name, isLocked, lockReason, lockDate };
  };

  const unionStatus = getObjectStatus('Об\'єднання');
  const rspStatus = getObjectStatus('РСП');
  const routeStatus = getObjectStatus('Маршрут');
  const warehouseStatus = getObjectStatus('Склад');

  // ----------------------------------------------------
  // Bottom Section: Client's Buffer Orders Registry
  // ----------------------------------------------------
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [showDatesSummary, setShowDatesSummary] = useState<boolean>(false);
  const [previewFileOrder, setPreviewFileOrder] = useState<QueueOrder | null>(null);

  // Pagination & Sorting for orders
  const [ordersPage, setOrdersPage] = useState<number>(1);
  const [ordersPageSize, setOrdersPageSize] = useState<number>(10);
  const [sortField, setSortField] = useState<keyof QueueOrder | null>('dateReceived');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Column filters
  const [columnFilters, setColumnFilters] = useState<QueueColumnFilters>({
    dateReceived: '',
    clOrderNo: '',
    msgId: '',
    clientName: '',
    clientCode: '',
    routeName: '',
    subCode: '',
    subName: '',
    fileName: '',
    managerName: '',
    orderedSum: '',
    pending: '',
    urgentazh: '',
    orderCountRows: ''
  });

  // Filter orders strictly for this client
  const clientOrders = useMemo(() => {
    return allOrders.filter(
      (o) =>
        o.clientCode === client.clCode ||
        o.clientName.toLowerCase() === client.clName.toLowerCase()
    );
  }, [allOrders, client.clCode, client.clName]);

  // Apply secondary filters
  const filteredOrders = useMemo(() => {
    return clientOrders.filter((order) => {
      // Date from filter
      if (filterDateFrom) {
        const [day, month, rest] = order.dateReceived.split('.');
        const year = rest ? rest.split(' ')[0] : '';
        const orderDateStr = `${year}-${month}-${day}`;
        if (orderDateStr < filterDateFrom) return false;
      }

      // Date to filter
      if (filterDateTo) {
        const [day, month, rest] = order.dateReceived.split('.');
        const year = rest ? rest.split(' ')[0] : '';
        const orderDateStr = `${year}-${month}-${day}`;
        if (orderDateStr > filterDateTo) return false;
      }

      // Column filters
      if (columnFilters.dateReceived && !order.dateReceived.toLowerCase().includes(columnFilters.dateReceived.toLowerCase())) return false;
      if (columnFilters.clOrderNo && !order.clOrderNo.toLowerCase().includes(columnFilters.clOrderNo.toLowerCase())) return false;
      if (columnFilters.msgId && !String(order.msgId).includes(columnFilters.msgId)) return false;
      if (columnFilters.clientName && !order.clientName.toLowerCase().includes(columnFilters.clientName.toLowerCase())) return false;
      if (columnFilters.clientCode && !order.clientCode.toLowerCase().includes(columnFilters.clientCode.toLowerCase())) return false;
      if (columnFilters.routeName && !order.routeName.toLowerCase().includes(columnFilters.routeName.toLowerCase())) return false;
      if (columnFilters.subCode && !order.subCode.toLowerCase().includes(columnFilters.subCode.toLowerCase())) return false;
      if (columnFilters.subName && !order.subName.toLowerCase().includes(columnFilters.subName.toLowerCase())) return false;
      if (columnFilters.fileName && !order.fileName.toLowerCase().includes(columnFilters.fileName.toLowerCase())) return false;
      if (columnFilters.managerName && !order.managerName.toLowerCase().includes(columnFilters.managerName.toLowerCase())) return false;
      if (columnFilters.orderedSum && !String(order.orderedSum).includes(columnFilters.orderedSum)) return false;
      if (columnFilters.pending && !order.pending.toLowerCase().includes(columnFilters.pending.toLowerCase())) return false;
      if (columnFilters.urgentazh && !order.urgentazh.toLowerCase().includes(columnFilters.urgentazh.toLowerCase())) return false;
      if (columnFilters.orderCountRows && !String(order.orderCountRows).includes(columnFilters.orderCountRows)) return false;

      return true;
    });
  }, [clientOrders, filterDateFrom, filterDateTo, columnFilters]);

  // Sorting
  const sortedOrders = useMemo(() => {
    return [...filteredOrders].sort((a, b) => {
      if (!sortField) return 0;
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (aVal === bVal) return 0;
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      return sortDir === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr);
    });
  }, [filteredOrders, sortField, sortDir]);

  // Pagination calculation
  const totalRecords = sortedOrders.length;
  const totalPages = Math.ceil(totalRecords / ordersPageSize) || 1;
  const pageIndex = Math.min(Math.max(ordersPage, 1), totalPages);
  const startIndex = (pageIndex - 1) * ordersPageSize;
  const endIndex = Math.min(startIndex + ordersPageSize, totalRecords);
  const pageOrders = sortedOrders.slice(startIndex, endIndex);

  // Totals calculations
  const totalSum = filteredOrders.reduce((acc, o) => acc + (o.orderedSum || 0), 0);
  const totalPositions = filteredOrders.reduce((acc, o) => acc + (o.orderCountRows || 0), 0);

  // Dates summary calculation
  const ordersByDate = useMemo(() => {
    const map = new Map<string, { date: string; count: number; positions: number; sum: number }>();
    filteredOrders.forEach((o) => {
      const datePart = o.dateReceived ? o.dateReceived.split(' ')[0] : 'Без дати';
      const existing = map.get(datePart) || { date: datePart, count: 0, positions: 0, sum: 0 };
      existing.count += 1;
      existing.positions += o.orderCountRows || 0;
      existing.sum += o.orderedSum || 0;
      map.set(datePart, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredOrders]);

  // Actions on selected orders
  const toggleSelectAll = () => {
    if (selectedOrderIds.length === pageOrders.length && pageOrders.length > 0) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(pageOrders.map((o) => o.id));
    }
  };

  const toggleSelectOrder = (id: number) => {
    if (selectedOrderIds.includes(id)) {
      setSelectedOrderIds(selectedOrderIds.filter((i) => i !== id));
    } else {
      setSelectedOrderIds([...selectedOrderIds, id]);
    }
  };

  const handleIgnoreSelected = () => {
    if (selectedOrderIds.length === 0) return;
    const updated = allOrders.map((o) =>
      selectedOrderIds.includes(o.id) ? { ...o, pending: 'Так' } : o
    );
    if (onUpdateOrders) onUpdateOrders(updated);
    setSelectedOrderIds([]);
  };

  const handleUnignoreSelected = () => {
    if (selectedOrderIds.length === 0) return;
    const updated = allOrders.map((o) =>
      selectedOrderIds.includes(o.id) ? { ...o, pending: 'Ні' } : o
    );
    if (onUpdateOrders) onUpdateOrders(updated);
    setSelectedOrderIds([]);
  };

  // Д9: іконка «Змінити ігнорування для обраних» перемикає ознаку кожного обраного замовлення (Так ↔ Ні)
  const handleToggleIgnoreSelected = () => {
    if (selectedOrderIds.length === 0) return;
    const updated = allOrders.map((o) =>
      selectedOrderIds.includes(o.id) ? { ...o, pending: o.pending === 'Так' ? 'Ні' : 'Так' } : o
    );
    if (onUpdateOrders) onUpdateOrders(updated);
    setSelectedOrderIds([]);
  };

  const handleRemoveSelected = () => {
    if (selectedOrderIds.length === 0) return;
    if (
      window.confirm(
        `Ви дійсно бажаєте видалити ${selectedOrderIds.length} обраних замовлень із черги буфера?`
      )
    ) {
      const updated = allOrders.filter((o) => !selectedOrderIds.includes(o.id));
      if (onUpdateOrders) onUpdateOrders(updated);
      setSelectedOrderIds([]);
    }
  };

  const clearColumnFilter = (key: keyof QueueColumnFilters) => {
    setColumnFilters((prev) => ({
      ...prev,
      [key]: ''
    }));
  };

  const handleSort = (field: keyof QueueOrder) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  return (
    <>
      {/* ======================================================= */}
      {/* Р2: Вікно «Зміна блокування автоімпорту клієнта»        */}
      {/* (замість сторінки «Картка клієнта»)                     */}
      {/* ======================================================= */}
      <div
        className="modal in"
        id="clientLockModal"
        role="dialog"
        style={{ display: 'block', zIndex: 1060, overflowY: 'auto' }}
        aria-modal="true"
      >
        <div className="modal-dialog" role="document" style={{ width: 760, maxWidth: '95vw', ...drag.dialogStyle }}>
          <div className="modal-content" style={{ borderRadius: 0, border: '1px solid #999', boxShadow: '0 5px 15px rgba(0,0,0,0.5)' }}>
            {/* Header */}
            <div
              className="modal-header"
              onMouseDown={drag.onHeaderMouseDown}
              title="Вікно можна перетягнути за заголовок"
              style={{
                backgroundColor: '#337ab7',
                color: '#fff',
                padding: '10px 15px',
                borderBottom: '1px solid #2e6da4',
                cursor: 'move'
              }}
            >
              <h4 className="modal-title" style={{ fontSize: 14, fontWeight: 'bold' }}>
                Зміна блокування автоімпорту клієнта
              </h4>
              <button
                type="button"
                className="close"
                onClick={onNavigateBack}
                title="Закрити без збереження"
                style={{ color: '#fff', opacity: 0.8, fontSize: 20, marginTop: -2 }}
              >
                <span>&times;</span>
              </button>
            </div>

            {/* Body */}
            <div className="modal-body" style={{ padding: 18, backgroundColor: '#fdfdfd' }}>
        {/* Client Identification Header */}
        <div
          style={{
            backgroundColor: '#f8f9fa',
            border: '1px solid #e2e4e8',
            padding: '10px 14px',
            marginBottom: 14,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 'bold', color: '#111' }}>
              {client.clCode} · {client.clName}
            </div>
            {client.unionName || client.corpName ? (
              <div style={{ fontSize: 12, color: '#555', marginTop: 3 }}>
                {client.unionName && (
                  <span>
                    Об'єднання: <strong>{client.unionName}</strong>
                  </span>
                )}
                {client.unionName && client.corpName && <span> · </span>}
                {client.corpName && (
                  <span>
                    Корпорація: <strong>{client.corpName}</strong>
                  </span>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#777', marginTop: 3 }}>
                Звичайний клієнт {client.deptName ? `· Склад: ${client.deptName}` : ''}
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, color: '#666', textAlign: 'right', marginLeft: 'auto' }}>
            {client.mngName && <div>Менеджер: <strong>{client.mngName}</strong></div>}
            {client.editDate && <div style={{ fontSize: 11, color: '#888' }}>Остання зміна: {client.editDate} ({client.editUser})</div>}
          </div>
        </div>

            <div
              style={{
                border: '1px solid #d5d5d5',
                padding: '14px 16px',
                marginBottom: 14,
                backgroundColor: '#fff',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 'bold',
                    fontSize: 13,
                    color: '#204d74',
                    marginBottom: 12,
                    borderBottom: '1px solid #eee',
                    paddingBottom: 6
                  }}
                >
                  1. Блокування клієнта (автоімпорт)
                </div>

                <div className="row" style={{ marginBottom: 12, marginLeft: 0, marginRight: 0, alignItems: 'center' }}>
                  <div className="col-xs-4" style={{ fontWeight: 600, fontSize: 12, color: '#333', paddingTop: 6 }}>
                    Заблокований:
                  </div>
                  <div className="col-xs-8">
                    <div className="btn-group" tabIndex={0}>
                      <button
                        type="button"
                        className={`btn btn-sm ${isBlocked ? 'btn-danger' : 'btn-default'}`}
                        onClick={() => setIsBlocked(true)}
                        style={{
                          borderRadius: 0,
                          minWidth: 70,
                          fontWeight: isBlocked ? 'bold' : 'normal',
                          backgroundColor: isBlocked ? '#c9302c' : '#fff',
                          borderColor: isBlocked ? '#ac2925' : '#ccc'
                        }}
                      >
                        Так
                      </button>
                      <button
                        type="button"
                        className={`btn btn-sm ${!isBlocked ? 'btn-success' : 'btn-default'}`}
                        onClick={() => setIsBlocked(false)}
                        style={{
                          borderRadius: 0,
                          minWidth: 70,
                          fontWeight: !isBlocked ? 'bold' : 'normal',
                          backgroundColor: !isBlocked ? '#449d44' : '#fff',
                          borderColor: !isBlocked ? '#398439' : '#ccc'
                        }}
                      >
                        Ні
                      </button>
                    </div>
                  </div>
                </div>

                <div className="row" style={{ marginBottom: 12, marginLeft: 0, marginRight: 0, alignItems: 'center' }}>
                  <div className="col-xs-4" style={{ fontWeight: 600, fontSize: 12, color: isBlocked ? '#333' : '#888', paddingTop: 6 }}>
                    Причина:
                  </div>
                  <div className="col-xs-8">
                    <select
                      className="form-control input-sm"
                      id="BLOCKING_REASON"
                      name="BLOCKING_REASON"
                      disabled={!isBlocked}
                      value={isBlocked ? reason : ''}
                      onChange={(e) => setReason(e.target.value)}
                      style={{
                        borderRadius: 0,
                        backgroundColor: isBlocked ? '#fff' : '#f5f5f5',
                        color: isBlocked ? '#333' : '#999',
                        borderColor: isBlocked ? '#ccc' : '#e0e0e0',
                        cursor: isBlocked ? 'default' : 'not-allowed'
                      }}
                    >
                      {isBlocked ? (
                        <>
                          {MANUAL_BLOCKING_REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </>
                      ) : (
                        <option value="">не вказана (розблоковано)</option>
                      )}
                    </select>
                  </div>
                </div>

                {/* Optional Schedule Period */}
                {isBlocked && (
                  <div className="row" style={{ marginTop: 10, marginLeft: 0, marginRight: 0, paddingTop: 10, borderTop: '1px dashed #eee' }}>
                    <div className="col-xs-4" style={{ fontSize: 11, fontWeight: 600, color: '#555', paddingTop: 4 }}>
                      Період (опціонально):
                    </div>
                    <div className="col-xs-4">
                      <DateTimeInput
                        className="form-control input-sm"
                        value={startDateTime}
                        onChange={setStartDateTime}
                        style={{ height: 26, fontSize: 11, borderRadius: 0 }}
                        title="Дата і час початку блокування"
                      />
                    </div>
                    <div className="col-xs-4">
                      <DateTimeInput
                        className="form-control input-sm"
                        value={endDateTime}
                        onChange={setEndDateTime}
                        style={{ height: 26, fontSize: 11, borderRadius: 0 }}
                        title="Дата і час завершення блокування"
                      />
                    </div>
                    {/* В7: очистити обидві дати одним кліком */}
                    <div className="col-xs-12" style={{ textAlign: 'right', marginTop: 6 }}>
                      <button
                        type="button"
                        className="btn btn-default btn-xs"
                        onClick={() => { setStartDateTime(''); setEndDateTime(''); }}
                        title="Очистити обидві дати одним кліком"
                        style={{ borderRadius: 0, fontSize: 11, padding: '2px 10px' }}
                      >
                        Очистити
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Р2: Буфер клієнта — окремим вікном; інші блокування — згорнуті за замовчуванням */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                marginBottom: showOtherLocks ? 10 : 0
              }}
            >
              <button
                type="button"
                className="btn btn-default btn-sm"
                onClick={() => setShowOtherLocks(!showOtherLocks)}
                aria-expanded={showOtherLocks}
                style={{ borderRadius: 0, fontSize: 12 }}
                title="Блокування об'єднання, РСП, маршруту, складу, які діють на клієнта"
              >
                {showOtherLocks ? '▾ Приховати інші блокування' : '▸ Показати інші блокування'}
              </button>
              <button
                type="button"
                id="btnOpenClientBuffer"
                className="btn btn-info btn-sm"
                onClick={() => setIsBufferOpen(true)}
                style={{ borderRadius: 0, fontSize: 12, fontWeight: 'bold' }}
                title="Відкрити замовлення клієнта у черзі (буфер) окремим вікном"
              >
                📦 Замовлення в черзі ({clientOrders.length})
              </button>
            </div>

            {showOtherLocks && (
            <div
              style={{
                border: '1px solid #d5d5d5',
                padding: '14px 16px',
                marginBottom: 14,
                backgroundColor: '#fafbfc',
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div
                  style={{
                    fontWeight: 'bold',
                    fontSize: 13,
                    color: '#555',
                    marginBottom: 10,
                    borderBottom: '1px solid #eee',
                    paddingBottom: 6,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span>2. Інші діючі блокування (довідково)</span>
                  <span style={{ fontSize: 11, fontWeight: 'normal', color: '#777' }}>тільки перегляд</span>
                </div>

                <div style={{ fontSize: 12 }}>
                  {/* Row 1: Об'єднання */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                      borderBottom: '1px solid #f0f0f0'
                    }}
                  >
                    <div style={{ width: '100px', fontWeight: 600, color: '#333' }}>Об'єднання:</div>
                    <div style={{ flex: 1, paddingRight: 10 }}>
                      {unionStatus.isLocked ? (
                        <span style={{ color: '#a94442', fontWeight: 600 }}>
                          🔴 Заблоковано — {unionStatus.lockReason}
                          {unionStatus.lockDate ? ` (з ${unionStatus.lockDate.split(' ')[0]})` : ''}
                        </span>
                      ) : (
                        <span style={{ color: '#777' }}>
                          ⚪ Не заблоковано <span style={{ color: '#999', fontSize: 11 }}>({unionStatus.name})</span>
                        </span>
                      )}
                    </div>
                    <div>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (onNavigateToObjectLocks) onNavigateToObjectLocks('Об\'єднання', unionStatus.name);
                        }}
                        style={{ color: '#337ab7', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}
                      >
                        Перейти →
                      </a>
                    </div>
                  </div>

                  {/* Row 2: РСП */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                      borderBottom: '1px solid #f0f0f0'
                    }}
                  >
                    <div style={{ width: '100px', fontWeight: 600, color: '#333' }}>РСП:</div>
                    <div style={{ flex: 1, paddingRight: 10 }}>
                      {rspStatus.isLocked ? (
                        <span style={{ color: '#a94442', fontWeight: 600 }}>
                          🔴 Заблоковано — {rspStatus.lockReason}
                          {rspStatus.lockDate ? ` (з ${rspStatus.lockDate.split(' ')[0]})` : ''}
                        </span>
                      ) : (
                        <span style={{ color: '#777' }}>
                          ⚪ Не заблоковано <span style={{ color: '#999', fontSize: 11 }}>({rspStatus.name})</span>
                        </span>
                      )}
                    </div>
                    <div>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (onNavigateToObjectLocks) onNavigateToObjectLocks('РСП', rspStatus.name);
                        }}
                        style={{ color: '#337ab7', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}
                      >
                        Перейти →
                      </a>
                    </div>
                  </div>

                  {/* Row 3: Маршрут */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 0',
                      borderBottom: '1px solid #f0f0f0'
                    }}
                  >
                    <div style={{ width: '100px', fontWeight: 600, color: '#333' }}>Маршрут:</div>
                    <div style={{ flex: 1, paddingRight: 10 }}>
                      {routeStatus.isLocked ? (
                        <span style={{ color: '#a94442', fontWeight: 600 }}>
                          🔴 Заблоковано — {routeStatus.lockReason}
                          {routeStatus.lockDate ? ` (з ${routeStatus.lockDate.split(' ')[0]})` : ''}
                        </span>
                      ) : (
                        <span style={{ color: '#777' }}>
                          ⚪ Не заблоковано <span style={{ color: '#999', fontSize: 11 }}>({routeStatus.name})</span>
                        </span>
                      )}
                    </div>
                    <div>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (onNavigateToObjectLocks) onNavigateToObjectLocks('Маршрут', routeStatus.name);
                        }}
                        style={{ color: '#337ab7', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}
                      >
                        Перейти →
                      </a>
                    </div>
                  </div>

                  {/* Row 4: Склад */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 0'
                    }}
                  >
                    <div style={{ width: '100px', fontWeight: 600, color: '#333' }}>Склад:</div>
                    <div style={{ flex: 1, paddingRight: 10 }}>
                      {warehouseStatus.isLocked ? (
                        <span style={{ color: '#a94442', fontWeight: 600 }}>
                          🔴 Заблоковано — {warehouseStatus.lockReason}
                          {warehouseStatus.lockDate ? ` (з ${warehouseStatus.lockDate.split(' ')[0]})` : ''}
                        </span>
                      ) : (
                        <span style={{ color: '#777' }}>
                          ⚪ Не заблоковано <span style={{ color: '#999', fontSize: 11 }}>({warehouseStatus.name})</span>
                        </span>
                      )}
                    </div>
                    <div>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          if (onNavigateToObjectLocks) onNavigateToObjectLocks('Склад', warehouseStatus.name);
                        }}
                        style={{ color: '#337ab7', fontSize: 11, fontWeight: 600, textDecoration: 'none' }}
                      >
                        Перейти →
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Informational Banner */}
              <div
                style={{
                  marginTop: 10,
                  padding: '6px 8px',
                  backgroundColor: '#fff',
                  border: '1px solid #e5e5e5',
                  fontSize: 11,
                  color: '#666',
                  lineHeight: 1.35
                }}
              >
                ℹ️ Якщо клієнт розблокований тут, але на нього діє блокування об'єднання, корпорації, РСП, складу або маршруту — його замовлення залишатимуться в буфері до зняття блокування відповідного об'єкта.
              </div>
            </div>
            )}
            </div>

            {/* Footer */}
            <div
              className="modal-footer"
              style={{
                backgroundColor: '#f5f5f5',
                borderTop: '1px solid #ddd',
                padding: '10px 20px',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 10
              }}
            >
              <button
                type="button"
                className="btn btn-default"
                onClick={onNavigateBack}
                style={{
                  borderRadius: 0,
                  padding: '6px 18px',
                  borderColor: '#ccc',
                  backgroundColor: '#fff',
                  color: '#333',
                  fontSize: 12
                }}
              >
                Скасувати
              </button>
              <button
                id="saveLockClient"
                type="button"
                className="btn btn-primary"
                onClick={handleSave}
                style={{
                  borderRadius: 0,
                  padding: '6px 24px',
                  fontWeight: 'bold',
                  fontSize: 12,
                  minWidth: 120,
                  backgroundColor: '#337ab7',
                  borderColor: '#2e6da4'
                }}
              >
                Зберегти
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop in" style={{ opacity: 0.5, zIndex: 1050 }}></div>

      {/* ======================================================= */}
      {/* Р2: Окреме вікно — замовлення клієнта у черзі (Буфер)   */}
      {/* Можна розгорнути на весь екран                          */}
      {/* ======================================================= */}
      {isBufferOpen && (
        <>
          <div
            className="modal in"
            id="clientBufferModal"
            role="dialog"
            style={{ display: 'block', zIndex: 1075, overflowY: isBufferMaximized ? 'hidden' : 'auto' }}
            aria-modal="true"
          >
            <div
              className="modal-dialog"
              role="document"
              style={
                isBufferMaximized
                  ? { width: '100%', maxWidth: 'none', height: '100vh', margin: 0 }
                  : { width: '94%', maxWidth: 1700, margin: '30px auto' }
              }
            >
              <div
                className="modal-content"
                style={{
                  borderRadius: 0,
                  border: '1px solid #999',
                  boxShadow: '0 5px 15px rgba(0,0,0,0.5)',
                  ...(isBufferMaximized ? { height: '100vh', display: 'flex', flexDirection: 'column' } : {})
                }}
              >
                <div
                  className="modal-header"
                  style={{
                    backgroundColor: '#337ab7',
                    color: '#fff',
                    padding: '8px 15px',
                    borderBottom: '1px solid #2e6da4',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <h4 className="modal-title" style={{ fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                    📦 Замовлення клієнта у черзі (Буфер): {client.clCode} · {client.clName} — {clientOrders.length} заявл.
                  </h4>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button
                      type="button"
                      id="btnToggleBufferMaximize"
                      className="btn btn-default btn-xs"
                      onClick={() => setIsBufferMaximized(!isBufferMaximized)}
                      style={{ borderRadius: 0, fontSize: 11, padding: '3px 10px' }}
                      title={isBufferMaximized ? 'Повернути звичайний розмір вікна' : 'Розгорнути вікно на весь екран'}
                    >
                      {isBufferMaximized ? '🗗 Звичайний розмір' : '⛶ На весь екран'}
                    </button>
                    <button
                      type="button"
                      className="close"
                      onClick={() => {
                        setIsBufferOpen(false);
                        setIsBufferMaximized(false);
                      }}
                      title="Закрити вікно буфера і повернутися до зміни блокування клієнта"
                      style={{ color: '#fff', opacity: 0.8, fontSize: 20, float: 'none', margin: 0 }}
                    >
                      <span>&times;</span>
                    </button>
                  </div>
                </div>
                <div
                  className="modal-body"
                  style={{
                    padding: 15,
                    backgroundColor: '#fdfdfd',
                    ...(isBufferMaximized ? { flex: 1, overflow: 'auto' } : {})
                  }}
                >
      <div>

        {/* Filter Bar (CRM layout, Client fixed & read-only, no union filter) */}
        <div
          id="tbl_filter_client_orders"
          style={{
            backgroundColor: '#fbfbfb',
            border: '1px solid #ddd',
            padding: '10px 15px',
            marginBottom: 12
          }}
        >
          <div className="row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px 15px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 'bold', fontSize: 12, color: '#333' }}>Клієнт:</span>
              <input
                type="text"
                className="form-control input-sm"
                value={`${client.clCode} — ${client.clName}`}
                disabled
                readOnly
                style={{ width: '280px', backgroundColor: '#eee', color: '#555', cursor: 'not-allowed', borderRadius: 0, height: 26, fontSize: 11 }}
                title="Фільтр зафіксований для поточного клієнта"
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 'bold', fontSize: 12, color: '#333' }}>Дата з:</span>
              <input
                type="date"
                className="form-control input-sm"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                style={{ width: '140px', borderRadius: 0, height: 26, fontSize: 11 }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 'bold', fontSize: 12, color: '#333' }}>Дата по:</span>
              <input
                type="date"
                className="form-control input-sm"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                style={{ width: '140px', borderRadius: 0, height: 26, fontSize: 11 }}
              />
            </div>

            <div style={{ display: 'inline-flex', gap: 8 }}>
              <button
                type="button"
                className="btn btn-success btn-xs"
                onClick={() => setOrdersPage(1)}
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                Застосувати фільтр
              </button>
              <button
                type="button"
                className="btn btn-default btn-xs"
                onClick={() => {
                  setFilterDateFrom('');
                  setFilterDateTo('');
                  setOrdersPage(1);
                }}
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                Скинути фільтр
              </button>
            </div>
          </div>
        </div>

        {/* Action Toolbar for Buffer Orders */}
        <div
          id="client_buffer_action_toolbar"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 12px',
            backgroundColor: '#eaf2f8',
            border: '1px solid #bce8f1',
            marginBottom: 10,
            borderRadius: 3
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 'bold', color: '#245580', fontSize: 12 }}>
              Дії з обраними замовленнями:
            </span>
            <button
              type="button"
              className="btn btn-warning btn-sm"
              disabled={selectedOrderIds.length === 0}
              onClick={handleIgnoreSelected}
              style={{ fontWeight: 600, fontSize: 11, padding: '3px 8px' }}
              title="Позначити обрані замовлення як ігноровані (не передавати в автообробку)"
            >
              Ігнорувати обрані ({selectedOrderIds.length})
            </button>
            <button
              type="button"
              className="btn btn-success btn-sm"
              disabled={selectedOrderIds.length === 0}
              onClick={handleUnignoreSelected}
              style={{ fontWeight: 600, fontSize: 11, padding: '3px 8px' }}
              title="Зняти ознаку ігнорування з обраних замовлень"
            >
              Зняти ознаку ігнорування ({selectedOrderIds.length})
            </button>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={selectedOrderIds.length === 0}
              onClick={handleRemoveSelected}
              style={{ fontWeight: 600, fontSize: 11, padding: '3px 8px' }}
              title="Видалити обрані замовлення з черги буфера"
            >
              Видалити з буфера ({selectedOrderIds.length})
            </button>
            {selectedOrderIds.length > 0 && (
              <button
                type="button"
                className="btn btn-default btn-sm"
                onClick={() => setSelectedOrderIds([])}
                style={{ fontSize: 11, padding: '3px 8px' }}
              >
                Зняти виділення
              </button>
            )}
          </div>

          <div>
            <button
              type="button"
              className="btn btn-info btn-sm"
              onClick={() => setShowDatesSummary(!showDatesSummary)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 8px' }}
            >
              <span>{showDatesSummary ? '▲' : '▼'}</span>
              <span>{showDatesSummary ? 'Приховати суму по датах' : 'Показати суму по датах'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Dates Summary Panel */}
        {showDatesSummary && (
          <div
            id="panel_dates_summary_client"
            style={{
              backgroundColor: '#fff',
              border: '1px solid #bce8f1',
              borderRadius: 3,
              padding: '10px 15px',
              marginBottom: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
          >
            <div style={{ fontWeight: 'bold', color: '#31708f', marginBottom: 8, fontSize: 12 }}>
              Зведені суми по датах надходження ({client.clName}):
            </div>
            <table className="table table-bordered table-condensed table-hover" style={{ marginBottom: 0, fontSize: 12 }}>
              <thead style={{ backgroundColor: '#f5f5f5' }}>
                <tr>
                  <th style={{ width: '25%' }}>Дата надходження</th>
                  <th style={{ width: '25%', textAlign: 'right' }}>Кількість замовлень</th>
                  <th style={{ width: '25%', textAlign: 'right' }}>Кількість позицій</th>
                  <th style={{ width: '25%', textAlign: 'right' }}>Загальна сума (грн)</th>
                </tr>
              </thead>
              <tbody>
                {ordersByDate.map((row) => (
                  <tr key={row.date}>
                    <td style={{ fontWeight: 'bold' }}>{row.date}</td>
                    <td style={{ textAlign: 'right' }}>{row.count}</td>
                    <td style={{ textAlign: 'right' }}>{row.positions}</td>
                    <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#245580' }}>
                      {row.sum.toLocaleString('uk-UA', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                {ordersByDate.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: '#888' }}>
                      Немає даних для відображення
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot style={{ backgroundColor: '#eef7fa', fontWeight: 'bold' }}>
                <tr>
                  <td>Всього:</td>
                  <td style={{ textAlign: 'right' }}>{filteredOrders.length}</td>
                  <td style={{ textAlign: 'right' }}>{totalPositions}</td>
                  <td style={{ textAlign: 'right', color: '#245580' }}>
                    {totalSum.toLocaleString('uk-UA', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Orders Table (jqGrid style) */}
        <div ref={gridRef} className="ui-jqgrid" id="gbox_clientBufferOrders" dir="ltr" style={{ width: '100%' }}>
          <div className="ui-jqgrid-view table-responsive" role="grid" style={{ width: '100%' }}>
            <div className="ui-jqgrid-hdiv" style={{ width: '100%' }}>
              <div className="ui-jqgrid-hbox">
                <table className="ui-jqgrid-htable ui-common-table table table-bordered" style={{ width: '100%', minWidth: 1400 }}>
                  <thead>
                    <tr className="ui-jqgrid-labels" role="row">
                      <th style={{ width: '36px', textAlign: 'center' }} className="ui-th-column ui-th-ltr jqgrid-multibox">
                        <div className="ui-th-div">
                          <input
                            type="checkbox"
                            checked={selectedOrderIds.length > 0 && selectedOrderIds.length === pageOrders.length}
                            onChange={toggleSelectAll}
                          />
                        </div>
                      </th>
                      <th style={{ width: '130px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('dateReceived')}>
                        <div className="ui-th-div">
                          Дата замовлення {sortField === 'dateReceived' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </div>
                      </th>
                      <th style={{ width: '100px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('clOrderNo')}>
                        <div className="ui-th-div">
                          Номер замовлення {sortField === 'clOrderNo' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </div>
                      </th>
                      <th style={{ width: '70px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('msgId')}>
                        <div className="ui-th-div">
                          ID замовл {sortField === 'msgId' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </div>
                      </th>
                      <th style={{ width: '140px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('clientName')}>
                        <div className="ui-th-div">
                          Кліент {sortField === 'clientName' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </div>
                      </th>
                      <th style={{ width: '80px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('clientCode')}>
                        <div className="ui-th-div">
                          Код кліента {sortField === 'clientCode' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </div>
                      </th>
                      <th style={{ width: '90px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('routeName')}>
                        <div className="ui-th-div">
                          Маршрут {sortField === 'routeName' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </div>
                      </th>
                      <th style={{ width: '85px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('subCode')}>
                        <div className="ui-th-div">
                          Код підрозділу {sortField === 'subCode' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </div>
                      </th>
                      <th style={{ width: '180px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('subName')}>
                        <div className="ui-th-div">
                          Назва підрозділу {sortField === 'subName' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </div>
                      </th>
                      <th style={{ width: '110px' }} className="ui-th-column ui-th-ltr">
                        <div className="ui-th-div">Файл заявки</div>
                      </th>
                      <th style={{ width: '120px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('managerName')}>
                        <div className="ui-th-div">
                          Менеджер {sortField === 'managerName' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </div>
                      </th>
                      <th style={{ width: '130px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('orderedSum')}>
                        <div className="ui-th-div">
                          Сума замовлення {sortField === 'orderedSum' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </div>
                      </th>
                      <th style={{ width: '75px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('pending')}>
                        <div className="ui-th-div">
                          Ігнорування {sortField === 'pending' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </div>
                      </th>
                      <th style={{ width: '70px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('urgentazh')}>
                        <div className="ui-th-div">
                          Ургентаж {sortField === 'urgentazh' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </div>
                      </th>
                      <th style={{ width: '110px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('orderCountRows')}>
                        <div className="ui-th-div">
                          Кількість позицій {sortField === 'orderCountRows' ? (sortDir === 'asc' ? '▲' : '▼') : ''}
                        </div>
                      </th>
                    </tr>

                    {/* Inline column filters */}
                    <tr className="ui-search-toolbar" role="row">
                      <th><div></div></th>
                      <th>
                        <table className="ui-search-table">
                          <tbody>
                            <tr>
                              <td className="ui-search-input">
                                <input
                                  type="text"
                                  className="form-control"
                                  value={columnFilters.dateReceived}
                                  onChange={(e) => setColumnFilters({ ...columnFilters, dateReceived: e.target.value })}
                                />
                              </td>
                              <td className="ui-search-clear">
                                <a className="clearsearchclass" onClick={() => clearColumnFilter('dateReceived')}>x</a>
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
                                  value={columnFilters.clOrderNo}
                                  onChange={(e) => setColumnFilters({ ...columnFilters, clOrderNo: e.target.value })}
                                />
                              </td>
                              <td className="ui-search-clear">
                                <a className="clearsearchclass" onClick={() => clearColumnFilter('clOrderNo')}>x</a>
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
                                  value={columnFilters.msgId}
                                  onChange={(e) => setColumnFilters({ ...columnFilters, msgId: e.target.value })}
                                />
                              </td>
                              <td className="ui-search-clear">
                                <a className="clearsearchclass" onClick={() => clearColumnFilter('msgId')}>x</a>
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
                                  value={columnFilters.clientName}
                                  onChange={(e) => setColumnFilters({ ...columnFilters, clientName: e.target.value })}
                                />
                              </td>
                              <td className="ui-search-clear">
                                <a className="clearsearchclass" onClick={() => clearColumnFilter('clientName')}>x</a>
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
                                  value={columnFilters.clientCode}
                                  onChange={(e) => setColumnFilters({ ...columnFilters, clientCode: e.target.value })}
                                />
                              </td>
                              <td className="ui-search-clear">
                                <a className="clearsearchclass" onClick={() => clearColumnFilter('clientCode')}>x</a>
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
                                  value={columnFilters.routeName}
                                  onChange={(e) => setColumnFilters({ ...columnFilters, routeName: e.target.value })}
                                />
                              </td>
                              <td className="ui-search-clear">
                                <a className="clearsearchclass" onClick={() => clearColumnFilter('routeName')}>x</a>
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
                                  value={columnFilters.subCode}
                                  onChange={(e) => setColumnFilters({ ...columnFilters, subCode: e.target.value })}
                                />
                              </td>
                              <td className="ui-search-clear">
                                <a className="clearsearchclass" onClick={() => clearColumnFilter('subCode')}>x</a>
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
                                  value={columnFilters.subName}
                                  onChange={(e) => setColumnFilters({ ...columnFilters, subName: e.target.value })}
                                />
                              </td>
                              <td className="ui-search-clear">
                                <a className="clearsearchclass" onClick={() => clearColumnFilter('subName')}>x</a>
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
                                  value={columnFilters.fileName}
                                  onChange={(e) => setColumnFilters({ ...columnFilters, fileName: e.target.value })}
                                />
                              </td>
                              <td className="ui-search-clear">
                                <a className="clearsearchclass" onClick={() => clearColumnFilter('fileName')}>x</a>
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
                                  value={columnFilters.managerName}
                                  onChange={(e) => setColumnFilters({ ...columnFilters, managerName: e.target.value })}
                                />
                              </td>
                              <td className="ui-search-clear">
                                <a className="clearsearchclass" onClick={() => clearColumnFilter('managerName')}>x</a>
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
                                  value={columnFilters.orderedSum}
                                  onChange={(e) => setColumnFilters({ ...columnFilters, orderedSum: e.target.value })}
                                />
                              </td>
                              <td className="ui-search-clear">
                                <a className="clearsearchclass" onClick={() => clearColumnFilter('orderedSum')}>x</a>
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
                                {/* ТЗ 4.6: фільтр «Ігнорування» — усі / тільки з ознакою / тільки без */}
                                <select
                                  className="form-control"
                                  value={columnFilters.pending}
                                  onChange={(e) => setColumnFilters({ ...columnFilters, pending: e.target.value })}
                                  style={{ padding: 0, height: 22, fontSize: 11 }}
                                >
                                  <option value="">Всі</option>
                                  <option value="Так">Так</option>
                                  <option value="Ні">Ні</option>
                                </select>
                              </td>
                              <td className="ui-search-clear">
                                <a className="clearsearchclass" onClick={() => clearColumnFilter('pending')}>x</a>
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
                                  value={columnFilters.urgentazh}
                                  onChange={(e) => setColumnFilters({ ...columnFilters, urgentazh: e.target.value })}
                                />
                              </td>
                              <td className="ui-search-clear">
                                <a className="clearsearchclass" onClick={() => clearColumnFilter('urgentazh')}>x</a>
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
                                  value={columnFilters.orderCountRows}
                                  onChange={(e) => setColumnFilters({ ...columnFilters, orderCountRows: e.target.value })}
                                />
                              </td>
                              <td className="ui-search-clear">
                                <a className="clearsearchclass" onClick={() => clearColumnFilter('orderCountRows')}>x</a>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {pageOrders.map((order) => {
                      const isChecked = selectedOrderIds.includes(order.id);
                      return (
                        <tr key={order.id} id={String(order.id)} className="jqgrow ui-row-ltr">
                          <td style={{ textAlign: 'center' }} className="jqgrid-multibox">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectOrder(order.id)}
                            />
                          </td>
                          <td>{order.dateReceived}</td>
                          <td>{order.clOrderNo}</td>
                          <td>{order.msgId}</td>
                          <td title={order.clientName}>{order.clientName}</td>
                          <td>{order.clientCode}</td>
                          <td>{order.routeName}</td>
                          <td>{order.subCode}</td>
                          <td title={order.subName}>{order.subName}</td>
                          <td>
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setPreviewFileOrder(order);
                              }}
                              style={{ color: '#337ab7', textDecoration: 'underline', fontWeight: 'bold' }}
                              title="Переглянути вміст файлу замовлення"
                            >
                              {order.fileName && order.fileName !== 'null' ? order.fileName : `order_${order.clOrderNo || order.id}.xml`}
                            </a>
                          </td>
                          <td title={order.managerName}>{order.managerName}</td>
                          <td style={{ textAlign: 'right' }}>
                            {order.orderedSum.toLocaleString('uk-UA', { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            {order.pending === 'Так' ? (
                              <span
                                className="label label-warning"
                                style={{
                                  backgroundColor: '#f0ad4e',
                                  color: '#fff',
                                  fontSize: 11,
                                  padding: '2px 6px',
                                  borderRadius: 2
                                }}
                              >
                                Так
                              </span>
                            ) : (
                              <span style={{ color: '#777' }}>Ні</span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>{order.urgentazh}</td>
                          <td style={{ textAlign: 'right' }}>{order.orderCountRows}</td>
                        </tr>
                      );
                    })}
                    {pageOrders.length === 0 && (
                      <tr>
                        <td colSpan={15} style={{ textAlign: 'center', padding: '24px', color: '#888' }}>
                          Не знайдено замовлень для цього клієнта у черзі буфера
                        </td>
                      </tr>
                    )}
                  </tbody>

                  {/* Summary Totals Footer */}
                  <tfoot>
                    <tr style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold' }}>
                      <td colSpan={11} style={{ textAlign: 'right', padding: '8px 12px', whiteSpace: 'nowrap' }}>
                        Разом по замовленнях клієнта ({filteredOrders.length} замовл.):
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px', color: '#245580', fontSize: 13, whiteSpace: 'nowrap' }}>
                        {totalSum.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн
                      </td>
                      <td colSpan={2} style={{ backgroundColor: '#f0f0f0' }}></td>
                      <td style={{ textAlign: 'right', padding: '8px', color: '#245580', fontSize: 13, whiteSpace: 'nowrap' }}>
                        {totalPositions}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Pager */}
            <div id="client_buffer_pager" className="ui-jqgrid-pager" dir="ltr" style={{ width: '100%' }}>
              <div className="ui-pager-control" role="group">
                <table className="ui-pg-table ui-common-table ui-pager-table table" style={{ margin: 0 }}>
                  <tbody>
                    <tr>
                      <td align="left" style={{ width: '25%' }}>
                        <table className="ui-pg-table navtable ui-common-table" style={{ margin: 0 }}>
                          <tbody>
                            <tr>
                              <td
                                className="ui-pg-button"
                                title="Змінити ігнорування для обраних"
                                onClick={handleToggleIgnoreSelected}
                                style={{ cursor: selectedOrderIds.length > 0 ? 'pointer' : 'default', opacity: selectedOrderIds.length > 0 ? 1 : 0.5 }}
                              >
                                <div className="ui-pg-div" style={{ padding: '0 4px', fontWeight: 'bold' }}>
                                  <span>▦</span>
                                </div>
                              </td>
                              <td className="ui-pg-button" title="Оновити" onClick={() => setOrdersPage(1)} style={{ cursor: 'pointer' }}>
                                <div className="ui-pg-div" style={{ padding: '0 4px' }}>
                                  <span>↻</span>
                                </div>
                              </td>
                              <td
                                className="ui-pg-button"
                                title="Експорт до Excel"
                                onClick={() => alert(`Експорт ${filteredOrders.length} замовлень у формат Excel розпочато.`)}
                                style={{ cursor: 'pointer' }}
                              >
                                <div className="ui-pg-div" style={{ padding: '0 4px' }}>
                                  <span>⤓</span>
                                </div>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>

                      <td align="center" style={{ whiteSpace: 'pre', width: '370px' }}>
                        <table className="ui-pg-table ui-common-table ui-paging-pager" style={{ margin: 0 }}>
                          <tbody>
                            <tr>
                              <td
                                className={`ui-pg-button ${pageIndex <= 1 ? 'ui-disabled' : ''}`}
                                title="Перша"
                                onClick={() => setOrdersPage(1)}
                              >
                                <span className="ui-icon ui-icon-seek-first">«</span>
                              </td>
                              <td
                                className={`ui-pg-button ${pageIndex <= 1 ? 'ui-disabled' : ''}`}
                                title="Попередня"
                                onClick={() => setOrdersPage(Math.max(1, pageIndex - 1))}
                              >
                                <span className="ui-icon ui-icon-seek-prev">‹</span>
                              </td>
                              <td className="ui-pg-button ui-state-disabled" style={{ width: '4px' }}>
                                <span className="ui-separator"></span>
                              </td>
                              <td dir="ltr">
                                Стор.{' '}
                                <input
                                  className="ui-pg-input form-control"
                                  type="text"
                                  size={2}
                                  maxLength={7}
                                  value={pageIndex}
                                  role="textbox"
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    if (!isNaN(val)) setOrdersPage(val);
                                  }}
                                  style={{ height: 22, width: 35, display: 'inline-block', padding: '0 4px', textAlign: 'center' }}
                                />{' '}
                                із <span id="sp_1_client_buffer_pager">{totalPages}</span>
                              </td>
                              <td className="ui-pg-button ui-state-disabled" style={{ width: '4px' }}>
                                <span className="ui-separator"></span>
                              </td>
                              <td
                                className={`ui-pg-button ${pageIndex >= totalPages ? 'ui-disabled' : ''}`}
                                title="Наступна"
                                onClick={() => setOrdersPage(Math.min(totalPages, pageIndex + 1))}
                              >
                                <span className="ui-icon ui-icon-seek-next">›</span>
                              </td>
                              <td
                                className={`ui-pg-button ${pageIndex >= totalPages ? 'ui-disabled' : ''}`}
                                title="Остання"
                                onClick={() => setOrdersPage(totalPages)}
                              >
                                <span className="ui-icon ui-icon-seek-end">»</span>
                              </td>
                              <td dir="ltr">
                                <select
                                  className="ui-pg-selbox form-control"
                                  role="listbox"
                                  title="Кількість рядків"
                                  value={ordersPageSize}
                                  onChange={(e) => {
                                    setOrdersPageSize(Number(e.target.value));
                                    setOrdersPage(1);
                                  }}
                                  style={{ height: 22, width: 50, display: 'inline-block', padding: '0 2px' }}
                                >
                                  <option role="option" value="10">10</option>
                                  <option role="option" value="20">20</option>
                                  <option role="option" value="50">50</option>
                                  <option role="option" value="100">100</option>
                                </select>
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>

                      <td align="right" style={{ width: '25%' }}>
                        <div dir="ltr" style={{ textAlign: 'right' }} className="ui-paging-info">
                          Записи {totalRecords > 0 ? startIndex + 1 : 0} - {endIndex} із {totalRecords}
                        </div>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop in" style={{ opacity: 0.5, zIndex: 1070 }}></div>
        </>
      )}

      {/* XML / Order File Content Preview Modal */}
      {previewFileOrder && (
        <div
          className="modal in"
          style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1090 }}
        >
          <div className="modal-dialog" style={{ maxWidth: 650 }}>
            <div className="modal-content">
              <div
                className="modal-header"
                style={{
                  backgroundColor: '#2b2b2b',
                  color: '#fff',
                  padding: '8px 15px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <h4 className="modal-title" style={{ fontSize: 14, fontWeight: 'bold' }}>
                  Вміст файлу заявки: {previewFileOrder.fileName || `order_${previewFileOrder.clOrderNo}.xml`}
                </h4>
                <button
                  type="button"
                  className="close"
                  onClick={() => setPreviewFileOrder(null)}
                  style={{ color: '#fff', opacity: 0.8, textShadow: 'none', fontSize: 20 }}
                >
                  ×
                </button>
              </div>
              <div className="modal-body" style={{ padding: 15, backgroundColor: '#f8f9fa' }}>
                <pre
                  style={{
                    maxHeight: 350,
                    overflowY: 'auto',
                    backgroundColor: '#fff',
                    padding: 12,
                    fontSize: 12,
                    border: '1px solid #ddd',
                    borderRadius: 3
                  }}
                >
{`<?xml version="1.0" encoding="utf-8"?>
<OrderMessage id="${previewFileOrder.msgId}">
  <Header>
    <OrderNo>${previewFileOrder.clOrderNo}</OrderNo>
    <DateReceived>${previewFileOrder.dateReceived}</DateReceived>
    <ClientCode>${previewFileOrder.clientCode}</ClientCode>
    <ClientName>${previewFileOrder.clientName}</ClientName>
    <Route>${previewFileOrder.routeName}</Route>
    <Subdivision code="${previewFileOrder.subCode}">${previewFileOrder.subName}</Subdivision>
    <Manager>${previewFileOrder.managerName}</Manager>
    <TotalSum currency="UAH">${previewFileOrder.orderedSum.toFixed(2)}</TotalSum>
    <RowsCount>${previewFileOrder.orderCountRows}</RowsCount>
    <Urgent>${previewFileOrder.urgentazh}</Urgent>
    <PendingStatus>${previewFileOrder.pending}</PendingStatus>
  </Header>
  <Items>
    <!-- Позиції замовлення (${previewFileOrder.orderCountRows} поз.) -->
    <Item line="1" code="MED-00124" name="Парацетамол табл. 500мг №10" qty="20" price="18.50" sum="370.00" />
    <Item line="2" code="MED-08912" name="Цитрамон-Дарниця №10" qty="15" price="10.00" sum="150.26" />
  </Items>
</OrderMessage>`}
                </pre>
              </div>
              <div className="modal-footer" style={{ padding: '8px 15px', backgroundColor: '#f1f1f1' }}>
                <button
                  type="button"
                  className="btn btn-default btn-sm"
                  onClick={() => setPreviewFileOrder(null)}
                >
                  Закрити
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
