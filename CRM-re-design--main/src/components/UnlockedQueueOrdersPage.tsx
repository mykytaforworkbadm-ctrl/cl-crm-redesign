import React, { useState } from 'react';
import { useGridColumns } from '../utils/useGridColumns';
import { UnlockedQueueOrder, ProcessingStatus } from '../types';

interface UnlockedQueueOrdersPageProps {
  orders: UnlockedQueueOrder[];
  onNavigateBack?: () => void;
}

export const UnlockedQueueOrdersPage: React.FC<UnlockedQueueOrdersPageProps> = ({ orders, onNavigateBack }) => {
  // В5: ширина колонок змінюється перетягуванням межі заголовка
  const gridRef = useGridColumns();
  // Top filter states
  const [clientSearch, setClientSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [unlockDateFilter, setUnlockDateFilter] = useState<string>('');
  const [reasonFilter, setReasonFilter] = useState<string>('all');

  // Sorting state
  const [sortField, setSortField] = useState<keyof UnlockedQueueOrder>('id');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(15);

  // Column inline filter states
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({
    id: '',
    dateReceived: '',
    clientCode: '',
    clientName: '',
    routeName: '',
    subCode: '',
    subName: '',
    managerName: '',
    clOrderNo: '',
    lockDate: '',
    lockUser: '',
    lockReason: '',
    lockTarget: '',
    unlockDate: '',
    unlockUser: '',
    ignored: '',
    urgentazh: '',
    mzkOrderNo: '',
    processingStatus: '',
    integrationError: '',
    statusComment: ''
  });

  const handleColumnFilterChange = (field: string, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [field]: value }));
    setCurrentPage(1);
  };

  const handleSort = (field: keyof UnlockedQueueOrder) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleResetFilters = () => {
    setClientSearch('');
    setStatusFilter('all');
    setUnlockDateFilter('');
    setReasonFilter('all');
    setColumnFilters({
      id: '',
      dateReceived: '',
      clientCode: '',
      clientName: '',
      routeName: '',
      subCode: '',
      subName: '',
      managerName: '',
      clOrderNo: '',
      lockDate: '',
      lockUser: '',
      lockReason: '',
      lockTarget: '',
      unlockDate: '',
      unlockUser: '',
      ignored: '',
      urgentazh: '',
      mzkOrderNo: '',
      processingStatus: '',
      integrationError: '',
      statusComment: ''
    });
    setCurrentPage(1);
  };

  // Filter logic
  const filteredOrders = orders.filter((o) => {
    // Top filter: Client
    if (clientSearch.trim()) {
      const q = clientSearch.toLowerCase().trim();
      const match = o.clientCode.toLowerCase().includes(q) || o.clientName.toLowerCase().includes(q);
      if (!match) return false;
    }

    // Top filter: Status
    if (statusFilter !== 'all' && o.processingStatus !== statusFilter) {
      return false;
    }

    // Top filter: Unlock Date
    if (unlockDateFilter.trim()) {
      const q = unlockDateFilter.toLowerCase().trim();
      if (!o.unlockDate.toLowerCase().includes(q)) return false;
    }

    // Top filter: Reason
    if (reasonFilter !== 'all' && o.lockReason !== reasonFilter) {
      return false;
    }

    // Column Filters
    for (const [key, value] of Object.entries(columnFilters)) {
      if (typeof value === 'string' && value.trim()) {
        const val = String((o as any)[key] || '').toLowerCase();
        if (!val.includes(value.toLowerCase().trim())) {
          return false;
        }
      }
    }

    return true;
  });

  // Sort logic
  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];

    if (valA === valB) return 0;
    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;

    let comp = 0;
    if (typeof valA === 'number' && typeof valB === 'number') {
      comp = valA - valB;
    } else {
      comp = String(valA).localeCompare(String(valB), 'uk');
    }

    return sortDirection === 'asc' ? comp : -comp;
  });

  // Pagination logic
  const totalItems = sortedOrders.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (validCurrentPage - 1) * pageSize;
  const paginatedOrders = sortedOrders.slice(startIndex, startIndex + pageSize);

  // Status badge styling and tooltip
  const renderStatusBadge = (status: ProcessingStatus) => {
    let tooltip = '';
    let badgeStyle: React.CSSProperties = {
      display: 'inline-block',
      padding: '3px 8px',
      fontSize: '11px',
      fontWeight: 'bold',
      borderRadius: '2px',
      whiteSpace: 'nowrap',
      cursor: 'help'
    };

    switch (status) {
      case 'Заблоковано':
        tooltip = 'Блок ще не знято';
        badgeStyle = {
          ...badgeStyle,
          backgroundColor: '#f2dede',
          color: '#a94442',
          border: '1px solid #ebccd1'
        };
        break;
      case 'В очікуванні опрацювання':
        tooltip = 'Блок знято, але інтеграція ще не почалась або зависла';
        badgeStyle = {
          ...badgeStyle,
          backgroundColor: '#fcf8e3',
          color: '#8a6d3b',
          border: '1px solid #faebcc'
        };
        break;
      case 'В процесі опрацювання':
        tooltip = 'Блок знято, триває процес інтеграції';
        badgeStyle = {
          ...badgeStyle,
          backgroundColor: '#d9edf7',
          color: '#31708f',
          border: '1px solid #bce8f1'
        };
        break;
      case 'Опрацьовано':
        tooltip = 'Інтеграція завершена';
        badgeStyle = {
          ...badgeStyle,
          backgroundColor: '#dff0d8',
          color: '#3c763d',
          border: '1px solid #d6e9c6'
        };
        break;
      case 'Ігноровано':
        tooltip = 'Замовлення позначено як ігнороване (не передається в опрацювання)';
        badgeStyle = {
          ...badgeStyle,
          backgroundColor: '#fff3cd',
          color: '#856404',
          border: '1px solid #ffeeba'
        };
        break;
    }

    return (
      <span style={badgeStyle} title={tooltip}>
        {status}
      </span>
    );
  };

  return (
    <div id="unlocked-queue-page" style={{ padding: '0 15px' }}>
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, marginTop: 10 }}>
        <div style={{ minWidth: onNavigateBack ? 280 : 0 }}>
          {onNavigateBack && (
            <button
              type="button"
              className="btn btn-default btn-sm"
              onClick={onNavigateBack}
              title="До сторінки блокування автообробки"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
            >
              <span>←</span> До сторінки блокування автообробки
            </button>
          )}
        </div>
        <div className="text-center" style={{ flex: 1 }}>
          <h2 style={{ fontFamily: 'fantasy', margin: '0 0 4px 0' }}>
            Замовлення у черзі (розблокування)
          </h2>
          <div style={{ fontSize: '12px', color: '#666' }}>
            Реєстр замовлень, які вийшли з буфера після зняття блокування з клієнта та проходять повторне автоопрацювання (тільки для перегляду)
          </div>
        </div>
        <div style={{ minWidth: onNavigateBack ? 280 : 0 }}></div>
      </div>

      {/* Top Filter Panel */}
      <div
        id="unlocked_filter_panel"
        style={{
          backgroundColor: '#fbfbfb',
          border: '1px solid #ddd',
          padding: '10px 15px',
          marginBottom: 12
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
            {/* Filter by client */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: '#333' }}>Клієнт:</span>
              <input
                type="text"
                className="form-control"
                placeholder="Код або назва клієнта..."
                style={{ width: '210px', height: '28px', fontSize: 12, borderRadius: 0 }}
                value={clientSearch}
                onChange={(e) => {
                  setClientSearch(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            {/* Filter by Processing Status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: '#333' }}>Статус опрацювання:</span>
              <select
                className="form-control"
                style={{ width: '220px', height: '28px', fontSize: 12, borderRadius: 0 }}
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">Всі статуси опрацювання</option>
                <option value="Заблоковано">Заблоковано (блок не знято)</option>
                <option value="В очікуванні опрацювання">В очікуванні опрацювання</option>
                <option value="В процесі опрацювання">В процесі опрацювання</option>
                <option value="Опрацьовано">Опрацьовано (завершено)</option>
                <option value="Ігноровано">Ігноровано</option>
              </select>
            </div>

            {/* Filter by Unlock Date */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: '#333' }}>Дата розблокування:</span>
              <input
                type="text"
                className="form-control"
                placeholder="дд.мм.рррр..."
                style={{ width: '130px', height: '28px', fontSize: 12, borderRadius: 0 }}
                value={unlockDateFilter}
                onChange={(e) => {
                  setUnlockDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
              />
            </div>

            {/* Filter by Blocking Reason */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: '#333' }}>Причина:</span>
              <select
                className="form-control"
                style={{ width: '200px', height: '28px', fontSize: 12, borderRadius: 0 }}
                value={reasonFilter}
                onChange={(e) => {
                  setReasonFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="all">Всі причини блокування</option>
                <option value="Блокування НКЦ">Блокування НКЦ</option>
                <option value="Частковий кредитний ліміт">Частковий кредитний ліміт</option>
                <option value="Дебіторська заборгованість">Дебіторська заборгованість</option>
                <option value="Кредитний ліміт">Кредитний ліміт</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn-default"
              style={{ borderRadius: 0, height: 28, padding: '3px 12px', fontSize: 12 }}
              onClick={handleResetFilters}
            >
              Скинути фільтри
            </button>
            <div style={{ fontSize: 12, color: '#555' }}>
              Знайдено: <strong>{totalItems}</strong> із {orders.length}
            </div>
          </div>
        </div>
      </div>

      {/* Main Table with horizontal scroll support */}
      <div
        ref={gridRef}
        className="table-responsive"
        style={{
          border: '1px solid #ddd',
          backgroundColor: '#fff',
          overflowX: 'auto',
          minHeight: '380px'
        }}
      >
        <table
          className="table table-bordered table-striped table-hover"
          style={{
            margin: 0,
            fontSize: '12px',
            minWidth: '2200px',
            whiteSpace: 'nowrap'
          }}
        >
          <thead>
            {/* Header row with sorting */}
            <tr style={{ backgroundColor: '#f5f5f5', color: '#333' }}>
              <th onClick={() => handleSort('id')} style={{ cursor: 'pointer', width: '70px', textAlign: 'center' }}>
                ID {sortField === 'id' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('dateReceived')} style={{ cursor: 'pointer', width: '135px' }}>
                Дата надходження замовлення {sortField === 'dateReceived' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('clientCode')} style={{ cursor: 'pointer', width: '85px' }}>
                Код клієнта {sortField === 'clientCode' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('clientName')} style={{ cursor: 'pointer', minWidth: '200px' }}>
                Назва клієнта {sortField === 'clientName' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('routeName')} style={{ cursor: 'pointer', width: '95px' }}>
                Маршрут {sortField === 'routeName' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('subCode')} style={{ cursor: 'pointer', width: '90px' }}>
                Код підрозділу {sortField === 'subCode' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('subName')} style={{ cursor: 'pointer', minWidth: '220px' }}>
                Назва підрозділу {sortField === 'subName' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('managerName')} style={{ cursor: 'pointer', width: '170px' }}>
                Менеджер клієнта {sortField === 'managerName' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('clOrderNo')} style={{ cursor: 'pointer', width: '130px' }}>
                Номер замовлення клієнта {sortField === 'clOrderNo' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('lockDate')} style={{ cursor: 'pointer', width: '130px', backgroundColor: '#fcf2f2' }}>
                Дата блокування {sortField === 'lockDate' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('lockUser')} style={{ cursor: 'pointer', width: '140px', backgroundColor: '#fcf2f2' }}>
                Змінив (блокування) {sortField === 'lockUser' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('lockReason')} style={{ cursor: 'pointer', width: '160px', backgroundColor: '#fcf2f2' }}>
                Причина блокування {sortField === 'lockReason' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('lockTarget')} style={{ cursor: 'pointer', width: '120px', backgroundColor: '#fcf2f2' }}>
                Об'єкт блокування {sortField === 'lockTarget' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('unlockDate')} style={{ cursor: 'pointer', width: '130px', backgroundColor: '#f2fcf2' }}>
                Дата розблокування {sortField === 'unlockDate' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('unlockUser')} style={{ cursor: 'pointer', width: '140px', backgroundColor: '#f2fcf2' }}>
                Змінив (розблокування) {sortField === 'unlockUser' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('ignored')} style={{ cursor: 'pointer', width: '85px', textAlign: 'center' }}>
                Ігнорування {sortField === 'ignored' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('urgentazh')} style={{ cursor: 'pointer', width: '75px', textAlign: 'center' }}>
                Ургентаж {sortField === 'urgentazh' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('mzkOrderNo')} style={{ cursor: 'pointer', width: '120px' }}>
                Номер замовлення в МЗК {sortField === 'mzkOrderNo' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('processingStatus')} style={{ cursor: 'pointer', width: '170px', textAlign: 'center' }}>
                Статус опрацювання {sortField === 'processingStatus' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('integrationError')} style={{ cursor: 'pointer', minWidth: '180px' }}>
                Помилка, що виникла в процесі інтеграції {sortField === 'integrationError' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th onClick={() => handleSort('statusComment')} style={{ cursor: 'pointer', minWidth: '220px' }}>
                Коментар до статусу {sortField === 'statusComment' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
              </th>
            </tr>

            {/* Inline search filters */}
            <tr style={{ backgroundColor: '#eaeaea' }}>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.id}
                  onChange={(e) => handleColumnFilterChange('id', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.dateReceived}
                  onChange={(e) => handleColumnFilterChange('dateReceived', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.clientCode}
                  onChange={(e) => handleColumnFilterChange('clientCode', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.clientName}
                  onChange={(e) => handleColumnFilterChange('clientName', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.routeName}
                  onChange={(e) => handleColumnFilterChange('routeName', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.subCode}
                  onChange={(e) => handleColumnFilterChange('subCode', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.subName}
                  onChange={(e) => handleColumnFilterChange('subName', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.managerName}
                  onChange={(e) => handleColumnFilterChange('managerName', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.clOrderNo}
                  onChange={(e) => handleColumnFilterChange('clOrderNo', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px', backgroundColor: '#fcf2f2' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.lockDate}
                  onChange={(e) => handleColumnFilterChange('lockDate', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px', backgroundColor: '#fcf2f2' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.lockUser}
                  onChange={(e) => handleColumnFilterChange('lockUser', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px', backgroundColor: '#fcf2f2' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.lockReason}
                  onChange={(e) => handleColumnFilterChange('lockReason', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px', backgroundColor: '#fcf2f2' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.lockTarget}
                  onChange={(e) => handleColumnFilterChange('lockTarget', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px', backgroundColor: '#f2fcf2' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.unlockDate}
                  onChange={(e) => handleColumnFilterChange('unlockDate', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px', backgroundColor: '#f2fcf2' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.unlockUser}
                  onChange={(e) => handleColumnFilterChange('unlockUser', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.ignored}
                  onChange={(e) => handleColumnFilterChange('ignored', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.urgentazh}
                  onChange={(e) => handleColumnFilterChange('urgentazh', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.mzkOrderNo}
                  onChange={(e) => handleColumnFilterChange('mzkOrderNo', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.processingStatus}
                  onChange={(e) => handleColumnFilterChange('processingStatus', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.integrationError}
                  onChange={(e) => handleColumnFilterChange('integrationError', e.target.value)}
                />
              </th>
              <th style={{ padding: '2px 4px' }}>
                <input
                  type="text"
                  className="form-control"
                  style={{ height: 22, fontSize: 11, padding: '1px 4px', borderRadius: 0 }}
                  value={columnFilters.statusComment}
                  onChange={(e) => handleColumnFilterChange('statusComment', e.target.value)}
                />
              </th>
            </tr>
          </thead>

          <tbody>
            {paginatedOrders.length === 0 ? (
              <tr>
                <td colSpan={21} style={{ textAlign: 'center', padding: '30px', color: '#888' }}>
                  Не знайдено замовлень за обраними критеріями фільтрації
                </td>
              </tr>
            ) : (
              paginatedOrders.map((o) => (
                <tr key={o.id}>
                  <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#555' }}>{o.id}</td>
                  <td>{o.dateReceived}</td>
                  <td style={{ fontWeight: 'bold', color: '#111' }}>{o.clientCode}</td>
                  <td style={{ fontWeight: 500 }}>{o.clientName}</td>
                  <td>{o.routeName}</td>
                  <td>{o.subCode}</td>
                  <td>{o.subName}</td>
                  <td>{o.managerName}</td>
                  <td style={{ fontWeight: 600 }}>{o.clOrderNo}</td>
                  <td style={{ color: '#a94442' }}>{o.lockDate}</td>
                  <td style={{ color: '#555' }}>{o.lockUser}</td>
                  <td>
                    <span style={{ fontSize: 11, padding: '1px 5px', backgroundColor: '#fcf2f2', border: '1px solid #ebccd1', color: '#a94442' }}>
                      {o.lockReason}
                    </span>
                  </td>
                  <td>{o.lockTarget}</td>
                  <td style={{ color: '#3c763d', fontWeight: o.unlockDate !== '—' ? 600 : 'normal' }}>
                    {o.unlockDate}
                  </td>
                  <td style={{ color: '#555' }}>{o.unlockUser}</td>
                  <td style={{ textAlign: 'center' }}>
                    {o.ignored === 'Так' ? <span style={{ color: '#c9302c', fontWeight: 'bold' }}>Так</span> : <span style={{ color: '#888' }}>Ні</span>}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {o.urgentazh === 'Так' ? <span style={{ color: '#c9302c', fontWeight: 'bold' }}>Так</span> : <span style={{ color: '#888' }}>Ні</span>}
                  </td>
                  <td style={{ fontWeight: o.mzkOrderNo !== '—' ? 600 : 'normal', color: o.mzkOrderNo !== '—' ? '#23527c' : '#888' }}>
                    {o.mzkOrderNo}
                  </td>
                  <td style={{ textAlign: 'center' }}>{renderStatusBadge(o.processingStatus)}</td>
                  <td style={{ color: o.integrationError !== '—' ? '#a94442' : '#888' }}>
                    {o.integrationError}
                  </td>
                  <td style={{ color: '#444' }}>{o.statusComment}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Footer controls in exact standard CRM flat style */}
      <div
        style={{
          marginTop: 10,
          marginBottom: 20,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#fbfbfb',
          border: '1px solid #ddd',
          padding: '6px 15px'
        }}
      >
        <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#666' }}>
            Показано {totalItems === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, totalItems)} із <strong>{totalItems}</strong> записів
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 12, color: '#666' }}>Рядків на сторінці:</span>
            <select
              className="form-control"
              style={{ width: '70px', height: '24px', fontSize: 11, padding: '0 4px', borderRadius: 0 }}
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Page Switcher */}
        <div style={{ display: 'flex', gap: 2 }}>
          <button
            type="button"
            className="btn btn-default"
            disabled={validCurrentPage <= 1}
            onClick={() => setCurrentPage(1)}
            style={{ borderRadius: 0, height: 26, padding: '2px 8px', fontSize: 11 }}
          >
            ««
          </button>
          <button
            type="button"
            className="btn btn-default"
            disabled={validCurrentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            style={{ borderRadius: 0, height: 26, padding: '2px 8px', fontSize: 11 }}
          >
            «
          </button>
          <span
            style={{
              padding: '4px 10px',
              fontSize: 12,
              fontWeight: 'bold',
              backgroundColor: '#fff',
              border: '1px solid #ccc'
            }}
          >
            {validCurrentPage} / {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-default"
            disabled={validCurrentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            style={{ borderRadius: 0, height: 26, padding: '2px 8px', fontSize: 11 }}
          >
            »
          </button>
          <button
            type="button"
            className="btn btn-default"
            disabled={validCurrentPage >= totalPages}
            onClick={() => setCurrentPage(totalPages)}
            style={{ borderRadius: 0, height: 26, padding: '2px 8px', fontSize: 11 }}
          >
            »»
          </button>
        </div>
      </div>
    </div>
  );
};
