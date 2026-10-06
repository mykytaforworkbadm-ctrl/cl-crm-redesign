import React, { useState, useEffect, useMemo } from 'react';
import { useGridColumns } from '../utils/useGridColumns';
import { QueueOrder, QueueColumnFilters, ClientRecord } from '../types';
import { UNIONS_DATA, CORPORATIONS_DATA } from '../data/mockData';

interface QueueOrdersPageProps {
  orders: QueueOrder[];
  initialClientFilter?: ClientRecord | null;
  initialShowIgnoredOnly?: boolean;
  onClearInitialFilter?: () => void;
  onNavigateBack?: () => void;
  onUpdateOrders?: (updatedOrders: QueueOrder[]) => void;
  returnClient?: ClientRecord | null;
}

export const QueueOrdersPage: React.FC<QueueOrdersPageProps> = ({
  orders,
  initialClientFilter,
  initialShowIgnoredOnly,
  onClearInitialFilter,
  onNavigateBack,
  onUpdateOrders,
  returnClient
}) => {
  // В5: шапка рухається з таблицею при горизонтальній прокрутці, ширина колонок змінюється перетягуванням межі
  const gridRef = useGridColumns();
  // Local mutable orders copy if onUpdateOrders is provided
  const [localOrders, setLocalOrders] = useState<QueueOrder[]>(orders);

  useEffect(() => {
    setLocalOrders(orders);
  }, [orders]);

  // Top filter states
  const [filterClient, setFilterClient] = useState<string>('');
  const [filterUnion, setFilterUnion] = useState<string>('');
  const [filterCorp, setFilterCorp] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');

  // Table pagination and selection
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // File Preview Modal state
  const [previewFileOrder, setPreviewFileOrder] = useState<QueueOrder | null>(null);

  // Collapsible summary by dates state
  const [showDatesSummary, setShowDatesSummary] = useState<boolean>(false);

  // Column inline filters
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

  // If initialClientFilter is passed (drill-down from registry)
  useEffect(() => {
    if (initialClientFilter) {
      setFilterClient(initialClientFilter.clCode);
      if (initialClientFilter.unionName) {
        setFilterUnion(initialClientFilter.unionName);
      }
      if (initialClientFilter.corpCode) {
        setFilterCorp(initialClientFilter.corpCode);
      }
    }
    if (initialShowIgnoredOnly) {
      setColumnFilters((prev) => ({ ...prev, pending: 'Так' }));
    }
  }, [initialClientFilter, initialShowIgnoredOnly]);

  // Apply top filters
  const topFilteredOrders = localOrders.filter((o) => {
    if (filterClient) {
      const q = filterClient.toLowerCase();
      const matchClient = o.clientCode.toLowerCase().includes(q) || o.clientName.toLowerCase().includes(q);
      if (!matchClient) return false;
    }
    if (filterUnion && filterUnion !== '0' && filterUnion !== '') {
      const q = filterUnion.toLowerCase();
      const matchUnion = o.unionName && o.unionName.toLowerCase().includes(q);
      if (!matchUnion) return false;
    }
    if (filterCorp && filterCorp !== 'all' && filterCorp !== '') {
      const matchCorp =
        (o.corpCode && o.corpCode === filterCorp) ||
        (o.corpName && o.corpName.includes(filterCorp));
      if (!matchCorp) return false;
    }
    if (filterDateFrom) {
      const orderDateParts = o.dateReceived.split(' ')[0].split('.');
      if (orderDateParts.length === 3) {
        const orderIso = `${orderDateParts[2]}-${orderDateParts[1]}-${orderDateParts[0]}`;
        if (orderIso < filterDateFrom) return false;
      }
    }
    if (filterDateTo) {
      const orderDateParts = o.dateReceived.split(' ')[0].split('.');
      if (orderDateParts.length === 3) {
        const orderIso = `${orderDateParts[2]}-${orderDateParts[1]}-${orderDateParts[0]}`;
        if (orderIso > filterDateTo) return false;
      }
    }
    return true;
  });

  // Apply inline column filters
  const finalFilteredOrders = topFilteredOrders.filter((o) => {
    if (columnFilters.dateReceived && !o.dateReceived.toLowerCase().includes(columnFilters.dateReceived.toLowerCase())) return false;
    if (columnFilters.clOrderNo && !o.clOrderNo.toLowerCase().includes(columnFilters.clOrderNo.toLowerCase())) return false;
    if (columnFilters.msgId && !String(o.msgId).includes(columnFilters.msgId)) return false;
    if (columnFilters.clientName && !o.clientName.toLowerCase().includes(columnFilters.clientName.toLowerCase())) return false;
    if (columnFilters.clientCode && !o.clientCode.toLowerCase().includes(columnFilters.clientCode.toLowerCase())) return false;
    if (columnFilters.routeName && !o.routeName.toLowerCase().includes(columnFilters.routeName.toLowerCase())) return false;
    if (columnFilters.subCode && !o.subCode.toLowerCase().includes(columnFilters.subCode.toLowerCase())) return false;
    if (columnFilters.subName && !o.subName.toLowerCase().includes(columnFilters.subName.toLowerCase())) return false;
    if (columnFilters.fileName && !o.fileName.toLowerCase().includes(columnFilters.fileName.toLowerCase())) return false;
    if (columnFilters.managerName && !o.managerName.toLowerCase().includes(columnFilters.managerName.toLowerCase())) return false;
    if (columnFilters.orderedSum && !String(o.orderedSum).includes(columnFilters.orderedSum)) return false;
    if (columnFilters.pending) {
      if (columnFilters.pending === 'Так' || columnFilters.pending === 'так') {
        if (o.pending.toLowerCase() !== 'так') return false;
      } else if (columnFilters.pending === 'Ні' || columnFilters.pending === 'ні') {
        if (o.pending.toLowerCase() !== 'ні') return false;
      } else if (!o.pending.toLowerCase().includes(columnFilters.pending.toLowerCase())) {
        return false;
      }
    }
    if (columnFilters.urgentazh && !o.urgentazh.toLowerCase().includes(columnFilters.urgentazh.toLowerCase())) return false;
    if (columnFilters.orderCountRows && !String(o.orderCountRows).includes(columnFilters.orderCountRows)) return false;
    return true;
  });

  // Calculate totals
  const totalSum = finalFilteredOrders.reduce((sum, o) => sum + o.orderedSum, 0);
  const totalPositions = finalFilteredOrders.reduce((sum, o) => sum + o.orderCountRows, 0);

  // Group by date for collapsible panel
  const ordersByDate = useMemo(() => {
    const map: Record<string, { date: string; count: number; positions: number; sum: number }> = {};
    finalFilteredOrders.forEach((o) => {
      const date = o.dateReceived.split(' ')[0];
      if (!map[date]) {
        map[date] = { date, count: 0, positions: 0, sum: 0 };
      }
      map[date].count += 1;
      map[date].positions += o.orderCountRows || 0;
      map[date].sum += o.orderedSum || 0;
    });
    return Object.values(map).sort((a, b) => {
      const pA = a.date.split('.');
      const pB = b.date.split('.');
      if (pA.length === 3 && pB.length === 3) {
        return `${pB[2]}-${pB[1]}-${pB[0]}`.localeCompare(`${pA[2]}-${pA[1]}-${pA[0]}`);
      }
      return b.date.localeCompare(a.date);
    });
  }, [finalFilteredOrders]);

  const totalPages = Math.max(1, Math.ceil(finalFilteredOrders.length / pageSize));
  const pageIndex = Math.min(currentPage, totalPages);
  const startIndex = (pageIndex - 1) * pageSize;
  const pageOrders = finalFilteredOrders.slice(startIndex, startIndex + pageSize);

  const handleResetFilters = () => {
    setFilterClient('');
    setFilterUnion('');
    setFilterCorp('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setColumnFilters({
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
    if (onClearInitialFilter) onClearInitialFilter();
  };

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

  // Actions on selected orders
  const handleIgnoreSelected = () => {
    if (selectedOrderIds.length === 0) return;
    const updated = localOrders.map((o) =>
      selectedOrderIds.includes(o.id) ? { ...o, pending: 'Так' } : o
    );
    setLocalOrders(updated);
    if (onUpdateOrders) onUpdateOrders(updated);
    setSelectedOrderIds([]);
  };

  const handleUnignoreSelected = () => {
    if (selectedOrderIds.length === 0) return;
    const updated = localOrders.map((o) =>
      selectedOrderIds.includes(o.id) ? { ...o, pending: 'Ні' } : o
    );
    setLocalOrders(updated);
    if (onUpdateOrders) onUpdateOrders(updated);
    setSelectedOrderIds([]);
  };

  // Д9: іконка «Змінити ігнорування для обраних» перемикає ознаку кожного обраного замовлення (Так ↔ Ні)
  const handleToggleIgnoreSelected = () => {
    if (selectedOrderIds.length === 0) return;
    const updated = localOrders.map((o) =>
      selectedOrderIds.includes(o.id) ? { ...o, pending: o.pending === 'Так' ? 'Ні' : 'Так' } : o
    );
    setLocalOrders(updated);
    if (onUpdateOrders) onUpdateOrders(updated);
    setSelectedOrderIds([]);
  };

  const handleRemoveSelected = () => {
    if (selectedOrderIds.length === 0) return;
    if (window.confirm(`Ви дійсно бажаєте видалити ${selectedOrderIds.length} обраних замовлень із черги буфера?`)) {
      const updated = localOrders.filter((o) => !selectedOrderIds.includes(o.id));
      setLocalOrders(updated);
      if (onUpdateOrders) onUpdateOrders(updated);
      setSelectedOrderIds([]);
    }
  };

  const clearColumnFilter = (key: keyof QueueColumnFilters) => {
    setColumnFilters({
      ...columnFilters,
      [key]: ''
    });
  };

  return (
    <div id="queue-orders-buffer-page" style={{ padding: '0 15px' }}>
      {/* Title and Top Navigation if drilled down */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 5 }}>
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
          <h2 style={{ fontFamily: 'fantasy', margin: 0 }}>Замовлення у черзі (Буфер)</h2>
        </div>
        <div style={{ minWidth: onNavigateBack ? 280 : 0 }}></div>
      </div>

      {/* Drill-down notification if applicable */}
      {initialClientFilter && (
        <div className="alert alert-info" style={{ padding: '8px 12px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong>Відфільтровано за клієнтом:</strong> {initialClientFilter.clCode} — {initialClientFilter.clName}
            {initialShowIgnoredOnly && (
              <span className="label label-warning" style={{ marginLeft: 10, backgroundColor: '#f0ad4e' }}>
                Тільки замовлення в ігноруванні
              </span>
            )}
          </div>
          <button
            type="button"
            className="btn btn-xs btn-default"
            onClick={handleResetFilters}
          >
            Скинути фільтр клієнта
          </button>
        </div>
      )}

      {/* Top Filter Bar in the same CRM layout */}
      <div
        id="tbl_filter"
        style={{
          backgroundColor: '#fbfbfb',
          border: '1px solid #ddd',
          padding: '12px 15px',
          marginBottom: 15
        }}
      >
        <div className="row" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 'bold', width: '180px' }}>
            Клієнт (код / назва):
          </div>
          <div style={{ width: '220px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Код або назва клієнта"
              value={filterClient}
              onChange={(e) => setFilterClient(e.target.value)}
            />
          </div>

          <div style={{ fontWeight: 'bold', width: '120px', paddingLeft: 15 }}>
            Об'єднання:
          </div>
          <div style={{ width: '250px' }}>
            <select
              className="form-control"
              value={filterUnion}
              onChange={(e) => setFilterUnion(e.target.value)}
            >
              <option value="">Всі об'єднання</option>
              {UNIONS_DATA.filter((u) => u.value !== 0 && !u.label.startsWith('A_')).map((u) => (
                <option key={u.value} value={u.label}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ fontWeight: 'bold', width: '120px', paddingLeft: 15 }}>
            Корпорація:
          </div>
          <div style={{ width: '250px' }}>
            <select
              className="form-control"
              value={filterCorp}
              onChange={(e) => setFilterCorp(e.target.value)}
            >
              <option value="all">Всі корпорації</option>
              {CORPORATIONS_DATA.filter((c) => c.value !== '' && c.value !== 'all').map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="row" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 'bold', width: '180px' }}>
            Дата надходження з:
          </div>
          <div style={{ width: '220px' }}>
            <input
              type="date"
              className="form-control"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
            />
          </div>

          <div style={{ fontWeight: 'bold', width: '180px', paddingLeft: 15 }}>
            Дата надходження по:
          </div>
          <div style={{ width: '220px' }}>
            <input
              type="date"
              className="form-control"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
            />
          </div>

          <div style={{ marginLeft: 20, display: 'inline-flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-success"
              onClick={() => setCurrentPage(1)}
            >
              Застосувати фільтр
            </button>
            <button
              type="button"
              className="btn btn-default"
              onClick={handleResetFilters}
            >
              Скинути фільтр
            </button>
          </div>
        </div>
      </div>

      {/* Action Toolbar for Buffer Orders */}
      <div
        id="buffer_action_toolbar"
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 'bold', color: '#245580', fontSize: 13 }}>
            Дії з обраними замовленнями:
          </span>
          <button
            type="button"
            className="btn btn-warning btn-sm"
            disabled={selectedOrderIds.length === 0}
            onClick={handleIgnoreSelected}
            style={{ fontWeight: 600 }}
            title="Позначити обрані замовлення як ігноровані (не передавати в автообробку)"
          >
            Ігнорувати обрані ({selectedOrderIds.length})
          </button>
          <button
            type="button"
            className="btn btn-success btn-sm"
            disabled={selectedOrderIds.length === 0}
            onClick={handleUnignoreSelected}
            style={{ fontWeight: 600 }}
            title="Зняти ознаку ігнорування з обраних замовлень"
          >
            Зняти ознаку ігнорування ({selectedOrderIds.length})
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={selectedOrderIds.length === 0}
            onClick={handleRemoveSelected}
            style={{ fontWeight: 600 }}
            title="Видалити обрані замовлення з черги буфера"
          >
            Видалити з буфера ({selectedOrderIds.length})
          </button>
          {selectedOrderIds.length > 0 && (
            <button
              type="button"
              className="btn btn-default btn-sm"
              onClick={() => setSelectedOrderIds([])}
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <span>{showDatesSummary ? '▲' : '▼'}</span>
            <span>{showDatesSummary ? 'Приховати суму по датах' : 'Показати суму по датах'}</span>
          </button>
        </div>
      </div>

      {/* Collapsible Dates Summary Panel (Item 2.3) */}
      {showDatesSummary && (
        <div
          id="panel_dates_summary"
          style={{
            backgroundColor: '#fff',
            border: '1px solid #bce8f1',
            borderRadius: 3,
            padding: '10px 15px',
            marginBottom: 12,
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          <div style={{ fontWeight: 'bold', color: '#31708f', marginBottom: 8, fontSize: 13 }}>
            Зведені суми по датах надходження (відфільтровано):
          </div>
          <table className="table table-bordered table-condensed table-hover" style={{ marginBottom: 0 }}>
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
                <td style={{ textAlign: 'right' }}>{finalFilteredOrders.length}</td>
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
      <div ref={gridRef} className="ui-jqgrid" id="gbox_bufferOrders" dir="ltr" style={{ width: '100%' }}>
        <div className="ui-jqgrid-view table-responsive" role="grid" id="gview_bufferOrders" style={{ width: '100%' }}>
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
                    <th style={{ width: '130px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Дата замовлення</div>
                    </th>
                    <th style={{ width: '100px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Номер замовлення</div>
                    </th>
                    <th style={{ width: '70px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">ID замовл</div>
                    </th>
                    <th style={{ width: '140px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Кліент</div>
                    </th>
                    <th style={{ width: '80px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Код кліента</div>
                    </th>
                    <th style={{ width: '90px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Маршрут</div>
                    </th>
                    <th style={{ width: '85px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Код підрозділу</div>
                    </th>
                    <th style={{ width: '180px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Назва підрозділу</div>
                    </th>
                    <th style={{ width: '110px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Файл заявки</div>
                    </th>
                    <th style={{ width: '120px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Менеджер</div>
                    </th>
                    <th style={{ width: '130px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Сума замовлення</div>
                    </th>
                    <th style={{ width: '75px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Ігнорування</div>
                    </th>
                    <th style={{ width: '70px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Ургентаж</div>
                    </th>
                    <th style={{ width: '110px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Кількість позицій</div>
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
                      <td colSpan={15} style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                        Не знайдено замовлень за вказаними фільтрами
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Summary Totals Footer */}
                <tfoot>
                  <tr style={{ backgroundColor: '#f0f0f0', fontWeight: 'bold' }}>
                    <td colSpan={11} style={{ textAlign: 'right', padding: '8px 12px', whiteSpace: 'nowrap' }}>
                      Разом по відфільтрованих замовленнях ({finalFilteredOrders.length} замовл.):
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
          <div id="buffer_pager" className="ui-jqgrid-pager" dir="ltr" style={{ width: '100%' }}>
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
                            <td className="ui-pg-button" title="Оновити" onClick={() => setCurrentPage(1)} style={{ cursor: 'pointer' }}>
                              <div className="ui-pg-div" style={{ padding: '0 4px' }}>
                                <span>↻</span>
                              </div>
                            </td>
                            <td
                              className="ui-pg-button"
                              title="Експорт до Excel"
                              onClick={() => alert(`Експорт ${finalFilteredOrders.length} замовлень у формат Excel розпочато.`)}
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
                              onClick={() => setCurrentPage(1)}
                            >
                              <span>«</span>
                            </td>
                            <td
                              className={`ui-pg-button ${pageIndex <= 1 ? 'ui-disabled' : ''}`}
                              title="Попередня"
                              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            >
                              <span>‹</span>
                            </td>
                            <td className="ui-pg-button ui-disabled">
                              <span className="ui-separator"></span>
                            </td>
                            <td dir="ltr">
                              Стор.{' '}
                              <input
                                className="ui-pg-input form-control"
                                type="text"
                                size={2}
                                value={pageIndex}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  if (!isNaN(val) && val >= 1 && val <= totalPages) {
                                    setCurrentPage(val);
                                  }
                                }}
                              />{' '}
                              з <span>{totalPages}</span>
                            </td>
                            <td className="ui-pg-button ui-disabled">
                              <span className="ui-separator"></span>
                            </td>
                            <td
                              className={`ui-pg-button ${pageIndex >= totalPages ? 'ui-disabled' : ''}`}
                              title="Наступна"
                              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            >
                              <span>›</span>
                            </td>
                            <td
                              className={`ui-pg-button ${pageIndex >= totalPages ? 'ui-disabled' : ''}`}
                              title="Остання"
                              onClick={() => setCurrentPage(totalPages)}
                            >
                              <span>»</span>
                            </td>
                            <td dir="ltr">
                              <select
                                className="ui-pg-selbox form-control"
                                value={pageSize}
                                onChange={(e) => {
                                  setPageSize(Number(e.target.value));
                                  setCurrentPage(1);
                                }}
                              >
                                <option value={5}>5</option>
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={30}>30</option>
                                <option value={500}>500</option>
                              </select>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </td>

                    <td align="right" style={{ width: '25%' }}>
                      <div className="ui-paging-info" style={{ textAlign: 'right' }}>
                        Перегляд {finalFilteredOrders.length === 0 ? 0 : startIndex + 1} - {Math.min(startIndex + pageSize, finalFilteredOrders.length)} з {finalFilteredOrders.length}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* File Preview Modal */}
      {previewFileOrder && (
        <div
          className="modal fade in"
          style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}
          role="dialog"
        >
          <div className="modal-dialog modal-lg" role="document">
            <div className="modal-content" style={{ borderRadius: 3, boxShadow: '0 5px 15px rgba(0,0,0,0.5)' }}>
              <div className="modal-header" style={{ backgroundColor: '#245580', color: '#fff', padding: '10px 15px' }}>
                <button
                  type="button"
                  className="close"
                  onClick={() => setPreviewFileOrder(null)}
                  style={{ color: '#fff', opacity: 0.8 }}
                >
                  &times;
                </button>
                <h4 className="modal-title" style={{ fontSize: 15, fontWeight: 'bold' }}>
                  Перегляд файлу замовлення: {previewFileOrder.fileName || `order_${previewFileOrder.clOrderNo}.xml`}
                </h4>
              </div>

              <div className="modal-body" style={{ maxHeight: 'calc(100vh - 210px)', overflowY: 'auto' }}>
                <div style={{ marginBottom: 12, padding: '10px', backgroundColor: '#f9f9f9', border: '1px solid #e3e3e3', borderRadius: 2 }}>
                  <div className="row" style={{ fontSize: 12 }}>
                    <div className="col-md-6">
                      <div><strong>Номер замовлення:</strong> {previewFileOrder.clOrderNo} (ID: {previewFileOrder.msgId})</div>
                      <div><strong>Клієнт:</strong> {previewFileOrder.clientName} ({previewFileOrder.clientCode})</div>
                      <div><strong>Підрозділ:</strong> {previewFileOrder.subName} ({previewFileOrder.subCode})</div>
                    </div>
                    <div className="col-md-6">
                      <div><strong>Дата надходження:</strong> {previewFileOrder.dateReceived}</div>
                      <div><strong>Маршрут:</strong> {previewFileOrder.routeName}</div>
                      <div><strong>Сума:</strong> {previewFileOrder.orderedSum.toLocaleString('uk-UA', { minimumFractionDigits: 2 })} грн ({previewFileOrder.orderCountRows} поз.)</div>
                      <div><strong>Статус ігнорування:</strong> {previewFileOrder.pending}</div>
                    </div>
                  </div>
                </div>

                <div style={{ fontWeight: 'bold', marginBottom: 6, fontSize: 13 }}>
                  Вміст файлу XML / EDI:
                </div>

                <pre
                  style={{
                    backgroundColor: '#282c34',
                    color: '#abb2bf',
                    padding: '12px',
                    borderRadius: 3,
                    fontSize: 12,
                    lineHeight: 1.5,
                    maxHeight: 320,
                    overflowY: 'auto',
                    fontFamily: 'Consolas, Menlo, Courier, monospace'
                  }}
                >
{`<?xml version="1.0" encoding="utf-8"?>
<ORDER document_id="${previewFileOrder.msgId}" order_number="${previewFileOrder.clOrderNo}" date="${previewFileOrder.dateReceived}">
  <HEADER>
    <BUYER code="${previewFileOrder.clientCode}" name="${previewFileOrder.clientName}" />
    <SUPPLIER code="CORP_001" name="ТОВ Баядера Логістик" />
    <DELIVERY_POINT route="${previewFileOrder.routeName}" subcode="${previewFileOrder.subCode}" name="${previewFileOrder.subName}" />
    <MANAGER name="${previewFileOrder.managerName}" />
    <URGENCY status="${previewFileOrder.urgentazh}" />
    <FLAG_PENDING value="${previewFileOrder.pending}" />
  </HEADER>
  <LINES count="${previewFileOrder.orderCountRows}">
    <LINE id="1" item_code="ART_9941" name="Горілка Хлібний Дар Класична 0.5л" quantity="20" price="114.50" total="2290.00" />
    <LINE id="2" item_code="ART_9942" name="Горілка Хлібний Дар Пшенична 0.7л" quantity="15" price="159.00" total="2385.00" />
    <LINE id="3" item_code="ART_8812" name="Коньяк Koblevo 5 зірок 0.5л" quantity="10" price="198.00" total="1980.00" />
    <LINE id="4" item_code="ART_7734" name="Вино Koblevo Мускат біле н/сол 0.75л" quantity="24" price="105.00" total="2520.00" />
  </LINES>
  <TOTALS positions="${previewFileOrder.orderCountRows}" currency="UAH" amount="${previewFileOrder.orderedSum.toFixed(2)}" />
</ORDER>`}
                </pre>
              </div>

              <div className="modal-footer" style={{ padding: '10px 15px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => alert(`Файл ${previewFileOrder.fileName || 'order.xml'} сформовано для завантаження.`)}
                >
                  ⤓ Завантажити XML
                </button>
                <button
                  type="button"
                  className="btn btn-default"
                  onClick={() => setPreviewFileOrder(null)}
                >
                  Закрити
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
