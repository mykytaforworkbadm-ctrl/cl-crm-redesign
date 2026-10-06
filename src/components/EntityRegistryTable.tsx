import React, { useState } from 'react';
import { useGridColumns } from '../utils/useGridColumns';
import { EntityRegistryRow, EntityType } from '../types';
import { formatClockTooltip, isShownAsBlocked, parseDateStringToMs } from '../utils/lockTiming';

interface EntityRegistryTableProps {
  entityType: 'union' | 'corp' | 'rsp' | 'dept' | 'route';
  rows: EntityRegistryRow[];
  onOpenChangeLock: (row: EntityRegistryRow) => void;
  onOpenHistory?: (row: EntityRegistryRow) => void; // Р4: «+» відкриває вікно «Історія»
  showOnlyLocked: boolean;
  showScheduledLocks?: boolean;
}

export const EntityRegistryTable: React.FC<EntityRegistryTableProps> = ({
  entityType,
  rows,
  onOpenChangeLock,
  onOpenHistory,
  showOnlyLocked,
  showScheduledLocks = false
}) => {
  // В5: шапка рухається з таблицею при горизонтальній прокрутці, ширина колонок змінюється перетягуванням межі
  const gridRef = useGridColumns();
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [sortField, setSortField] = useState<keyof EntityRegistryRow | null>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Inline column filters
  const [colFilters, setColFilters] = useState({
    block: '',
    name: '',
    editDate: '',
    editUser: '',
    reason: '',
    countOrders: '',
    sumOrders: '',
    countRows: ''
  });

  const getEntityTitle = () => {
    switch (entityType) {
      case 'union':
        return 'Об\'єднання';
      case 'corp':
        return 'Корпорація';
      case 'rsp':
        return 'РСП';
      case 'dept':
        return 'Склад';
      case 'route':
        return 'Маршрут';
      default:
        return 'Об\'єкт';
    }
  };

  // Filter rows
  const filteredRows = rows.filter((r) => {
    // Checkbox filter from parent
    if (showOnlyLocked && !r.isBlocked) return false;
    // Ф2 п.1: тільки рядки з блокуванням, що починається в майбутньому
    if (showScheduledLocks && !r.isFuture) return false;

    // Inline column filters
    if (colFilters.block !== '') {
      const isBlockedExpected = colFilters.block === '1';
      // фільтр колонки «Блок» — за тим значенням, яке видно в колонці
      if (isShownAsBlocked(r.isBlocked, Boolean(r.isFuture)) !== isBlockedExpected) return false;
    }
    if (colFilters.name && !r.name.toLowerCase().includes(colFilters.name.toLowerCase())) {
      return false;
    }
    if (colFilters.editDate && !r.editDate.toLowerCase().includes(colFilters.editDate.toLowerCase())) {
      return false;
    }
    if (colFilters.editUser && !r.editUser.toLowerCase().includes(colFilters.editUser.toLowerCase())) {
      return false;
    }
    if (colFilters.reason && !r.reason.toLowerCase().includes(colFilters.reason.toLowerCase())) {
      return false;
    }
    if (colFilters.countOrders && !String(r.countOrders).toLowerCase().includes(colFilters.countOrders.toLowerCase())) {
      return false;
    }
    if (colFilters.sumOrders && !r.sumOrders.toLowerCase().includes(colFilters.sumOrders.toLowerCase())) {
      return false;
    }
    if (colFilters.countRows && !String(r.countRows).toLowerCase().includes(colFilters.countRows.toLowerCase())) {
      return false;
    }
    return true;
  });

  // Sort rows
  const sortedRows = [...filteredRows].sort((a, b) => {
    if (!sortField) return 0;
    const aVal = a[sortField];
    const bVal = b[sortField];

    if (aVal === bVal) return 0;
    if (aVal === undefined || aVal === null || aVal === '') return 1;
    if (bVal === undefined || bVal === null || bVal === '') return -1;

    // Numbers
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    }

    // Booleans
    if (typeof aVal === 'boolean' && typeof bVal === 'boolean') {
      return sortDir === 'asc' ? (aVal ? -1 : 1) : (aVal ? 1 : -1);
    }

    // Ф2: період блокування сортується як дата, а не як рядок
    if (sortField === 'startDate' || sortField === 'endDate') {
      const msA = parseDateStringToMs(String(aVal)) ?? Infinity;
      const msB = parseDateStringToMs(String(bVal)) ?? Infinity;
      if (msA === msB) return 0;
      return sortDir === 'asc' ? (msA < msB ? -1 : 1) : (msA < msB ? 1 : -1);
    }

    // Formatted sums e.g. "142 800,00"
    if (sortField === 'sumOrders') {
      const numA = parseFloat(String(aVal).replace(/\s/g, '').replace(',', '.')) || 0;
      const numB = parseFloat(String(bVal).replace(/\s/g, '').replace(',', '.')) || 0;
      return sortDir === 'asc' ? numA - numB : numB - numA;
    }

    // Strings
    const strA = String(aVal).toLowerCase();
    const strB = String(bVal).toLowerCase();
    if (strA < strB) return sortDir === 'asc' ? -1 : 1;
    if (strA > strB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageIndex = Math.min(currentPage, totalPages);
  const startIndex = (pageIndex - 1) * pageSize;
  const pageRows = sortedRows.slice(startIndex, startIndex + pageSize);

  const handleSort = (field: keyof EntityRegistryRow) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const renderSortIndicator = (field: keyof EntityRegistryRow) => {
    if (sortField === field) {
      return (
        <span
          style={{
            display: 'inline-block',
            marginLeft: 4,
            fontSize: 10,
            color: '#1a568c',
            fontWeight: 'bold',
            verticalAlign: 'middle',
            userSelect: 'none'
          }}
          title={sortDir === 'asc' ? 'Сортування: за зростанням' : 'Сортування: за спаданням'}
        >
          {sortDir === 'asc' ? '▲' : '▼'}
        </span>
      );
    }
    return (
      <span
        style={{
          display: 'inline-block',
          marginLeft: 4,
          fontSize: 9,
          color: '#c5c5c5',
          verticalAlign: 'middle',
          userSelect: 'none',
          letterSpacing: '-1px'
        }}
        title="Сортувати"
      >
        ▲▼
      </span>
    );
  };

  return (
    <div id="entity-registry-table-container" style={{ marginTop: 6 }}>
      <div ref={gridRef} className="ui-jqgrid" id="gbox_gridEntityResults" dir="ltr" style={{ width: '100%' }}>
        <div className="ui-jqgrid-view table-responsive" role="grid" id="gview_gridEntityResults" style={{ width: '100%' }}>
          <div className="ui-jqgrid-hdiv" style={{ width: '100%' }}>
            <div className="ui-jqgrid-hbox">
              <table
                className="ui-jqgrid-htable ui-common-table table table-bordered"
                style={{ width: '100%', minWidth: showScheduledLocks ? 1391 : 1131 }}
                role="presentation"
              >
                <thead>
                  {/* 1. Header Labels */}
                  <tr className="ui-jqgrid-labels" role="row">
                    {/* 0: Історія (Р4) */}
                    <th style={{ width: '31px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div"></div>
                    </th>
                    {/* 1: Блок */}
                    <th
                      style={{ width: '70px', cursor: 'pointer' }}
                      className="ui-th-column ui-th-ltr"
                      onClick={() => handleSort('isBlocked')}
                    >
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Блок {renderSortIndicator('isBlocked')}
                      </div>
                    </th>

                    {/* 2: Змінити */}
                    <th style={{ width: '75px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Змінити</div>
                    </th>

                    {/* 3: [Назва сутності] */}
                    <th
                      style={{ width: '280px', cursor: 'pointer' }}
                      className="ui-th-column ui-th-ltr"
                      onClick={() => handleSort('name')}
                    >
                      <div className="ui-th-div ui-jqgrid-sortable">
                        {getEntityTitle()} {renderSortIndicator('name')}
                      </div>
                    </th>

                    {/* 4: Дата змін */}
                    <th
                      style={{ width: '130px', cursor: 'pointer' }}
                      className="ui-th-column ui-th-ltr"
                      onClick={() => handleSort('editDate')}
                    >
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Дата змін {renderSortIndicator('editDate')}
                      </div>
                    </th>

                    {/* 5: Змінив */}
                    <th
                      style={{ width: '160px', cursor: 'pointer' }}
                      className="ui-th-column ui-th-ltr"
                      onClick={() => handleSort('editUser')}
                    >
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Змінив {renderSortIndicator('editUser')}
                      </div>
                    </th>

                    {/* 6: Причина */}
                    <th
                      style={{ width: '220px', cursor: 'pointer' }}
                      className="ui-th-column ui-th-ltr"
                      onClick={() => handleSort('reason')}
                    >
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Причина {renderSortIndicator('reason')}
                      </div>
                    </th>

                    {/* 7: Кількість замовлень */}
                    <th
                      style={{ width: '110px', cursor: 'pointer' }}
                      className="ui-th-column ui-th-ltr"
                      onClick={() => handleSort('countOrders')}
                    >
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Кількість замовлень {renderSortIndicator('countOrders')}
                      </div>
                    </th>

                    {/* 8: Сума замовлень */}
                    <th
                      style={{ width: '125px', cursor: 'pointer' }}
                      className="ui-th-column ui-th-ltr"
                      onClick={() => handleSort('sumOrders')}
                    >
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Сума замовлень {renderSortIndicator('sumOrders')}
                      </div>
                    </th>

                    {/* 9: Кількість позицій */}
                    <th
                      style={{ width: '110px', cursor: 'pointer' }}
                      className="ui-th-column ui-th-ltr"
                      onClick={() => handleSort('countRows')}
                    >
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Кількість позицій {renderSortIndicator('countRows')}
                      </div>
                    </th>

                    {/* Ф2 п.2: період запланованого блокування */}
                    {showScheduledLocks && (
                      <>
                        <th style={{ width: '130px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('startDate')}>
                          <div className="ui-th-div ui-jqgrid-sortable">
                            Дата блокування з {renderSortIndicator('startDate')}
                          </div>
                        </th>
                        <th style={{ width: '130px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('endDate')}>
                          <div className="ui-th-div ui-jqgrid-sortable">
                            Дата блокування по {renderSortIndicator('endDate')}
                          </div>
                        </th>
                      </>
                    )}
                  </tr>

                  {/* 2. Inline Filters Row */}
                  <tr className="ui-search-toolbar" role="row">
                    <th style={{ padding: '2px 4px' }}></th>
                    {/* Filter: Блок */}
                    <th style={{ padding: '2px 4px' }}>
                      <select
                        className="form-control"
                        style={{ height: 22, padding: '1px 2px', fontSize: 11, borderRadius: 0 }}
                        value={colFilters.block}
                        onChange={(e) => setColFilters({ ...colFilters, block: e.target.value })}
                      >
                        <option value="">Всі</option>
                        <option value="1">Так</option>
                        <option value="0">Ні</option>
                      </select>
                    </th>

                    {/* Filter: Змінити */}
                    <th style={{ padding: '2px 4px' }}></th>

                    {/* Filter: Назва */}
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={colFilters.name}
                                onChange={(e) => setColFilters({ ...colFilters, name: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a
                                className="clearsearchclass"
                                onClick={() => setColFilters({ ...colFilters, name: '' })}
                                style={{ cursor: 'pointer' }}
                              >
                                x
                              </a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>

                    {/* Filter: Дата змін */}
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={colFilters.editDate}
                                onChange={(e) => setColFilters({ ...colFilters, editDate: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a
                                className="clearsearchclass"
                                onClick={() => setColFilters({ ...colFilters, editDate: '' })}
                                style={{ cursor: 'pointer' }}
                              >
                                x
                              </a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>

                    {/* Filter: Змінив */}
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={colFilters.editUser}
                                onChange={(e) => setColFilters({ ...colFilters, editUser: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a
                                className="clearsearchclass"
                                onClick={() => setColFilters({ ...colFilters, editUser: '' })}
                                style={{ cursor: 'pointer' }}
                              >
                                x
                              </a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>

                    {/* Filter: Причина */}
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={colFilters.reason}
                                onChange={(e) => setColFilters({ ...colFilters, reason: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a
                                className="clearsearchclass"
                                onClick={() => setColFilters({ ...colFilters, reason: '' })}
                                style={{ cursor: 'pointer' }}
                              >
                                x
                              </a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>

                    {/* Filter: Кількість замовлень */}
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={colFilters.countOrders}
                                onChange={(e) => setColFilters({ ...colFilters, countOrders: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a
                                className="clearsearchclass"
                                onClick={() => setColFilters({ ...colFilters, countOrders: '' })}
                                style={{ cursor: 'pointer' }}
                              >
                                x
                              </a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>

                    {/* Filter: Сума замовлень */}
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={colFilters.sumOrders}
                                onChange={(e) => setColFilters({ ...colFilters, sumOrders: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a
                                className="clearsearchclass"
                                onClick={() => setColFilters({ ...colFilters, sumOrders: '' })}
                                style={{ cursor: 'pointer' }}
                              >
                                x
                              </a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>

                    {/* Filter: Кількість позицій */}
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={colFilters.countRows}
                                onChange={(e) => setColFilters({ ...colFilters, countRows: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a
                                className="clearsearchclass"
                                onClick={() => setColFilters({ ...colFilters, countRows: '' })}
                                style={{ cursor: 'pointer' }}
                              >
                                x
                              </a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    {showScheduledLocks && (
                      <>
                        <th style={{ padding: '2px 4px' }}></th>
                        <th style={{ padding: '2px 4px' }}></th>
                      </>
                    )}
                  </tr>
                </thead>
              </table>
            </div>
          </div>

          {/* 3. Table Body */}
          <div className="ui-jqgrid-bdiv" style={{ width: '100%', minHeight: 350 }}>
            <table
              className="ui-jqgrid-btable ui-common-table table table-bordered"
              style={{ width: '100%', minWidth: showScheduledLocks ? 1391 : 1131 }}
            >
              <tbody>
                {pageRows.map((row) => {
                  return (
                    <tr
                      key={String(row.id)}
                      id={String(row.id)}
                      className="jqgrow ui-row-ltr"
                    >
                      {/* 0: Історія (Р4) */}
                      <td
                        style={{ width: '31px', textAlign: 'center', cursor: 'pointer', fontWeight: 'bold', color: '#337ab7' }}
                        title="Історія блокування"
                        onClick={() => onOpenHistory && onOpenHistory(row)}
                      >
                        +
                      </td>
                      {/* 1: Блок */}
                      <td style={{ width: '70px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                          {isShownAsBlocked(row.isBlocked, Boolean(row.isFuture)) ? (
                            <span
                              style={{
                                padding: '2px 6px',
                                color: '#a94442',
                                backgroundColor: '#fdf2f2',
                                border: '1px solid #ebccd1',
                                display: 'inline-block',
                                fontSize: 11,
                                fontWeight: 'bold',
                                lineHeight: '14px',
                                minWidth: 26,
                                textAlign: 'center'
                              }}
                            >
                              Так
                            </span>
                          ) : (
                            <span
                              style={{
                                padding: '2px 6px',
                                color: '#2e6b30',
                                backgroundColor: '#f3faf3',
                                border: '1px solid #d4ecd5',
                                display: 'inline-block',
                                fontSize: 11,
                                lineHeight: '14px',
                                minWidth: 26,
                                textAlign: 'center'
                              }}
                            >
                              Ні
                            </span>
                          )}
                          {row.isScheduled && (
                            <span
                              title={formatClockTooltip(row.isBlocked, row.startDate, row.endDate)}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 12,
                                cursor: 'help',
                                padding: '1px 3px',
                                color: '#8a6d3b',
                                backgroundColor: '#fcf8e3',
                                border: '1px solid #faebcc',
                                lineHeight: 1,
                                userSelect: 'none'
                              }}
                            >
                              ⏱
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 2: Змінити */}
                      <td style={{ width: '75px', textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-primary changeLock"
                          style={{ padding: '2px 8px', fontSize: 11, borderRadius: 0 }}
                          onClick={() => onOpenChangeLock(row)}
                        >
                          Змінити
                        </button>
                      </td>

                      {/* 3: Назва */}
                      <td style={{ width: '280px', fontWeight: 600 }} title={row.name}>
                        {row.name}
                      </td>

                      {/* 4: Дата змін */}
                      <td style={{ width: '130px' }}>{row.editDate || '\u00A0'}</td>

                      {/* 5: Змінив */}
                      <td style={{ width: '160px' }} title={row.editUser}>
                        {row.editUser || '\u00A0'}
                      </td>

                      {/* 6: Причина */}
                      <td style={{ width: '220px' }} title={row.groupName ? `${row.reason} (група «${row.groupName}»)` : row.reason}>
                        {row.reason || '\u00A0'}
                        {row.groupName && <span style={{ color: '#6f42c1', fontSize: 11 }}> · група «{row.groupName}»</span>}
                      </td>

                      {/* 7: Кількість замовлень */}
                      <td style={{ width: '110px', textAlign: 'right' }}>
                        {row.countOrders !== '' && row.countOrders !== 0 ? row.countOrders : '\u00A0'}
                      </td>

                      {/* 8: Сума замовлень */}
                      <td style={{ width: '125px', textAlign: 'right' }}>
                        {row.sumOrders !== '' && row.sumOrders !== '0,00' ? row.sumOrders : '\u00A0'}
                      </td>

                      {/* 9: Кількість позицій */}
                      <td style={{ width: '110px', textAlign: 'right' }}>
                        {row.countRows !== '' && row.countRows !== 0 ? row.countRows : '\u00A0'}
                      </td>

                      {showScheduledLocks && (
                        <>
                          <td style={{ width: '130px', textAlign: 'center' }}>{row.startDate || '—'}</td>
                          <td style={{ width: '130px', textAlign: 'center' }}>{row.endDate || '—'}</td>
                        </>
                      )}
                    </tr>
                  );
                })}

                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={showScheduledLocks ? 12 : 10} style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                      Немає записів для відображення
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* 4. Bottom JQGrid Pager */}
          <div className="ui-jqgrid-pager" id="gridEntityPager" dir="ltr" style={{ width: '100%' }}>
            <table className="ui-pg-table ui-common-table ui-pager" style={{ width: '100%' }}>
              <tbody>
                <tr>
                  <td id="pager_left" align="left" style={{ width: '30%' }}></td>
                  <td id="pager_center" align="center" style={{ whiteSpace: 'pre', width: '350px' }}>
                    <table className="ui-pg-table ui-common-table ui-paging-pager" style={{ margin: 0 }}>
                      <tbody>
                        <tr>
                          <td
                            className={`ui-pg-button ${pageIndex <= 1 ? 'ui-disabled' : ''}`}
                            title="Перша"
                            onClick={() => setCurrentPage(1)}
                            style={{ cursor: pageIndex <= 1 ? 'default' : 'pointer' }}
                          >
                            <span>«</span>
                          </td>
                          <td
                            className={`ui-pg-button ${pageIndex <= 1 ? 'ui-disabled' : ''}`}
                            title="Попередня"
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            style={{ cursor: pageIndex <= 1 ? 'default' : 'pointer' }}
                          >
                            <span>‹</span>
                          </td>
                          <td className="ui-pg-button ui-disabled">
                            <span className="ui-separator"></span>
                          </td>
                          <td id="input_pager" dir="ltr">
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
                            style={{ cursor: pageIndex >= totalPages ? 'default' : 'pointer' }}
                          >
                            <span>›</span>
                          </td>
                          <td
                            className={`ui-pg-button ${pageIndex >= totalPages ? 'ui-disabled' : ''}`}
                            title="Остання"
                            onClick={() => setCurrentPage(totalPages)}
                            style={{ cursor: pageIndex >= totalPages ? 'default' : 'pointer' }}
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
                              <option value={10}>10</option>
                              <option value={20}>20</option>
                              <option value={30}>30</option>
                              <option value={50}>50</option>
                            </select>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                  <td id="pager_right" align="right" style={{ width: '30%' }}>
                    <div className="ui-paging-info" style={{ textAlign: 'right' }}>
                      Перегляд {sortedRows.length === 0 ? 0 : startIndex + 1} -{' '}
                      {Math.min(startIndex + pageSize, sortedRows.length)} з {sortedRows.length}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
