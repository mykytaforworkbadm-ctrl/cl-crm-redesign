import React, { useState, useEffect } from 'react';
import { useGridColumns } from '../utils/useGridColumns';
import { ClientRecord, ColumnFilters } from '../types';
import { computeLockTimingState, formatClockTooltip, formatToDisplayDateTime, isShownAsBlocked, parseDateStringToMs } from '../utils/lockTiming';

interface ClientsTableProps {
  clients: ClientRecord[];
  selectedClientId: number | null;
  onSelectClient: (client: ClientRecord) => void;
  onOpenChangeLock: (client: ClientRecord) => void;
  onOpenHistory?: (client: ClientRecord) => void; // Р4: «+» відкриває вікно «Історія»
  onDrilldownBuffer?: (client: ClientRecord, showIgnoredOnly?: boolean) => void;
  columnFilters: ColumnFilters;
  onColumnFilterChange: (filters: ColumnFilters) => void;
  showScheduledLocks?: boolean;
  showIgnoredOrders?: boolean;
  showOnlyLocked?: boolean;
  tablePage?: number;
  onTablePageChange?: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  sortField?: keyof ClientRecord | null;
  onSortFieldChange?: (field: keyof ClientRecord | null) => void;
  sortDir?: 'asc' | 'desc';
  onSortDirChange?: (dir: 'asc' | 'desc') => void;
}

// Ф2: блокування клієнта (власне або через об'єкт), що починається в майбутньому
// Якщо майбутніх блокувань кілька — береться найближче за датою початку
export const getFutureLockDetail = (client: ClientRecord) => {
  const future = (client.lockDetails || []).filter((ld) => computeLockTimingState(ld).isFuture);
  if (future.length === 0) return undefined;
  return future.reduce((best, ld) =>
    (parseDateStringToMs(ld.startDate) ?? Infinity) < (parseDateStringToMs(best.startDate) ?? Infinity) ? ld : best
  );
};

export const getScheduledObject = (client: ClientRecord): string => {
  const futureDetail = getFutureLockDetail(client);
  if (futureDetail) return futureDetail.source;
  if (client.scheduledObject) return client.scheduledObject;
  const scheduledDetail = client.lockDetails?.find((ld) => ld.isScheduled);
  if (scheduledDetail) return scheduledDetail.source;
  return 'Клієнт';
};

export const ClientsTable: React.FC<ClientsTableProps> = ({
  clients,
  selectedClientId,
  onSelectClient,
  onOpenChangeLock,
  onOpenHistory,
  onDrilldownBuffer,
  columnFilters,
  onColumnFilterChange,
  showScheduledLocks = false,
  showIgnoredOrders = false,
  showOnlyLocked = false,
  tablePage: controlledPage,
  onTablePageChange,
  pageSize: controlledPageSize,
  onPageSizeChange,
  sortField: controlledSortField,
  onSortFieldChange,
  sortDir: controlledSortDir,
  onSortDirChange
}) => {
  // В5: шапка рухається з таблицею при горизонтальній прокрутці, ширина колонок змінюється перетягуванням межі
  const gridRef = useGridColumns();
  const [internalPage, setInternalPage] = useState<number>(1);
  const [internalPageSize, setInternalPageSize] = useState<number>(10);
  const [internalSortField, setInternalSortField] = useState<keyof ClientRecord | null>('clName');
  const [internalSortDir, setInternalSortDir] = useState<'asc' | 'desc'>('asc');

  const currentPage = controlledPage !== undefined ? controlledPage : internalPage;
  const setCurrentPage = (pageOrFn: number | ((p: number) => number)) => {
    const nextPage = typeof pageOrFn === 'function' ? pageOrFn(currentPage) : pageOrFn;
    if (onTablePageChange) onTablePageChange(nextPage);
    else setInternalPage(nextPage);
  };

  const pageSize = controlledPageSize !== undefined ? controlledPageSize : internalPageSize;
  const setPageSize = (size: number) => {
    if (onPageSizeChange) onPageSizeChange(size);
    else setInternalPageSize(size);
  };

  const sortField = controlledSortField !== undefined ? controlledSortField : internalSortField;
  const setSortField = (field: keyof ClientRecord | null) => {
    if (onSortFieldChange) onSortFieldChange(field);
    else setInternalSortField(field);
  };

  const sortDir = controlledSortDir !== undefined ? controlledSortDir : internalSortDir;
  const setSortDir = (dir: 'asc' | 'desc') => {
    if (onSortDirChange) onSortDirChange(dir);
    else setInternalSortDir(dir);
  };

  // Auto-scroll to selected client row when returning to registry
  useEffect(() => {
    if (selectedClientId) {
      const timer = setTimeout(() => {
        const el = document.getElementById(String(selectedClientId));
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [selectedClientId, currentPage]);

  // Handle column filtering
  const filteredClients = clients.filter((c) => {
    // 1. Checkbox "Показати тільки заблокованих"
    if (showOnlyLocked && !c.isBlocked) {
      return false;
    }

    // 2. Checkbox "Показати заплановані блокування"
    // залишаються тільки записи із запланованим, ще не застосованим блокуванням (де в колонці «Блок» стоїть іконка годинника)
    // Ф2 п.1: тільки клієнти, у яких є блокування з початком у майбутньому
    if (showScheduledLocks && !getFutureLockDetail(c)) {
      return false;
    }

    // 3. Checkbox "Показати проігноровані замовлення"
    // залишаються клієнти, у яких немає активного блокування, але в буфері є заявки з ознакою ігнорування
    if (showIgnoredOrders) {
      if (c.isBlocked) return false;
      if (!c.countIgnored || Number(c.countIgnored) <= 0) return false;
    }

    if (columnFilters.type && columnFilters.type !== '') {
      if (c.type !== columnFilters.type) return false;
    }
    if (columnFilters.block && columnFilters.block !== '') {
      const isBlockedExpected = columnFilters.block === '1';
      // фільтр колонки «Блок» — за тим значенням, яке видно в колонці
      if (isShownAsBlocked(c.isBlocked, Boolean(getFutureLockDetail(c))) !== isBlockedExpected) return false;
    }
    if (columnFilters.clCode && !c.clCode.toLowerCase().includes(columnFilters.clCode.toLowerCase())) return false;
    if (columnFilters.clName && !c.clName.toLowerCase().includes(columnFilters.clName.toLowerCase())) return false;
    if (columnFilters.corpCode && !c.corpCode.toLowerCase().includes(columnFilters.corpCode.toLowerCase())) return false;
    if (columnFilters.corpName && !c.corpName.toLowerCase().includes(columnFilters.corpName.toLowerCase())) return false;
    if (columnFilters.unionName && !c.unionName.toLowerCase().includes(columnFilters.unionName.toLowerCase())) return false;
    if (columnFilters.mngName && !c.mngName.toLowerCase().includes(columnFilters.mngName.toLowerCase())) return false;
    if (columnFilters.editDate && !c.editDate.toLowerCase().includes(columnFilters.editDate.toLowerCase())) return false;
    if (columnFilters.editUser && !c.editUser.toLowerCase().includes(columnFilters.editUser.toLowerCase())) return false;
    if (columnFilters.reason && !c.reason.toLowerCase().includes(columnFilters.reason.toLowerCase())) return false;
    if (columnFilters.countUrgent && String(c.countUrgent) !== columnFilters.countUrgent) return false;
    if (columnFilters.countOrders && String(c.countOrders) !== columnFilters.countOrders) return false;
    if (columnFilters.sumAllOrders && !c.sumAllOrders.toLowerCase().includes(columnFilters.sumAllOrders.toLowerCase())) return false;
    if (columnFilters.countRowsAllOrders && String(c.countRowsAllOrders) !== columnFilters.countRowsAllOrders) return false;
    if (columnFilters.countIgnored && String(c.countIgnored) !== columnFilters.countIgnored) return false;
    if (columnFilters.scheduledStart && !formatToDisplayDateTime(getFutureLockDetail(c)?.startDate).toLowerCase().includes(columnFilters.scheduledStart.toLowerCase())) return false;
    if (columnFilters.scheduledEnd && !formatToDisplayDateTime(getFutureLockDetail(c)?.endDate).toLowerCase().includes(columnFilters.scheduledEnd.toLowerCase())) return false;
    if (columnFilters.scheduledObject && !getScheduledObject(c).toLowerCase().includes(columnFilters.scheduledObject.toLowerCase())) return false;
    return true;
  });

  // Accurate sorting for numbers, strings, and dates
  const sortedClients = [...filteredClients].sort((a, b) => {
    if (!sortField) return 0;
    // Ф2: сортування за періодом запланованого блокування — за датою, а не як рядок
    if (sortField === 'scheduledStart' || sortField === 'scheduledEnd') {
      const key = sortField === 'scheduledStart' ? 'startDate' : 'endDate';
      const msA = parseDateStringToMs(getFutureLockDetail(a)?.[key]) ?? Infinity;
      const msB = parseDateStringToMs(getFutureLockDetail(b)?.[key]) ?? Infinity;
      if (msA === msB) return 0;
      return sortDir === 'asc' ? (msA < msB ? -1 : 1) : (msA < msB ? 1 : -1);
    }

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

    // Formatted sums e.g. "12 450.00"
    if (sortField === 'sumAllOrders') {
      const numA = parseFloat(String(aVal).replace(/\s/g, '').replace(',', '.')) || 0;
      const numB = parseFloat(String(bVal).replace(/\s/g, '').replace(',', '.')) || 0;
      return sortDir === 'asc' ? numA - numB : numB - numA;
    }

    // Scheduled Object
    if (sortField === 'scheduledObject') {
      const strA = getScheduledObject(a).toLowerCase();
      const strB = getScheduledObject(b).toLowerCase();
      if (strA < strB) return sortDir === 'asc' ? -1 : 1;
      if (strA > strB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    }

    // Strings
    const strA = String(aVal).toLowerCase();
    const strB = String(bVal).toLowerCase();
    if (strA < strB) return sortDir === 'asc' ? -1 : 1;
    if (strA > strB) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.max(1, Math.ceil(sortedClients.length / pageSize));
  const pageIndex = Math.min(currentPage, totalPages);
  const startIndex = (pageIndex - 1) * pageSize;
  const pageClients = sortedClients.slice(startIndex, startIndex + pageSize);

  const handleSort = (field: keyof ClientRecord) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const clearColumnFilter = (key: keyof ColumnFilters) => {
    onColumnFilterChange({
      ...columnFilters,
      [key]: ''
    });
  };

  // Modern clean single sort indicator
  const renderSortIndicator = (field: keyof ClientRecord) => {
    const isCurrent = sortField === field;
    if (isCurrent) {
      return (
        <span
          style={{
            display: 'inline-block',
            marginLeft: 5,
            fontSize: 11,
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
    <div id="clients-table-container" style={{ marginTop: 6 }}>
      <div ref={gridRef} className="ui-jqgrid" id="gbox_gridResults" dir="ltr" style={{ width: '100%' }}>
        <div className="ui-jqgrid-view table-responsive" role="grid" id="gview_gridResults" style={{ width: '100%' }}>
          <div className="ui-jqgrid-hdiv" style={{ width: '100%' }}>
            <div className="ui-jqgrid-hbox">
              <table className="ui-jqgrid-htable ui-common-table table table-bordered" style={{ width: '100%', minWidth: 1480 }} role="presentation">
                <thead>
                  <tr className="ui-jqgrid-labels" role="row">
                    <th style={{ width: '31px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div"></div>
                    </th>
                    <th style={{ width: '68px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('type')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Тип {renderSortIndicator('type')}
                      </div>
                    </th>
                    <th style={{ width: '60px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('isBlocked')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Блок {renderSortIndicator('isBlocked')}
                      </div>
                    </th>
                    <th style={{ width: '75px' }} className="ui-th-column ui-th-ltr">
                      <div className="ui-th-div">Змінити</div>
                    </th>
                    <th style={{ width: '87px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('clCode')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Код {renderSortIndicator('clCode')}
                      </div>
                    </th>
                    <th style={{ width: '190px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('clName')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Назва {renderSortIndicator('clName')}
                      </div>
                    </th>
                    <th style={{ width: '90px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('corpCode')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Код корпорації {renderSortIndicator('corpCode')}
                      </div>
                    </th>
                    <th style={{ width: '130px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('corpName')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Корпорація {renderSortIndicator('corpName')}
                      </div>
                    </th>
                    <th style={{ width: '130px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('unionName')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Об'єднання {renderSortIndicator('unionName')}
                      </div>
                    </th>
                    <th style={{ width: '120px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('mngName')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Менеджер {renderSortIndicator('mngName')}
                      </div>
                    </th>
                    <th style={{ width: '95px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('editDate')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Дата змін {renderSortIndicator('editDate')}
                      </div>
                    </th>
                    <th style={{ width: '95px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('editUser')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Змінив {renderSortIndicator('editUser')}
                      </div>
                    </th>
                    <th style={{ width: '150px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('reason')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Причина {renderSortIndicator('reason')}
                      </div>
                    </th>
                    <th style={{ width: '80px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('countUrgent')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Ургентаж {renderSortIndicator('countUrgent')}
                      </div>
                    </th>
                    <th style={{ width: '90px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('countOrders')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Кількість замовлень {renderSortIndicator('countOrders')}
                      </div>
                    </th>
                    <th style={{ width: '95px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('sumAllOrders')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Сума замовлень {renderSortIndicator('sumAllOrders')}
                      </div>
                    </th>
                    <th style={{ width: '90px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('countRowsAllOrders')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Кількість позицій {renderSortIndicator('countRowsAllOrders')}
                      </div>
                    </th>
                    <th style={{ width: '70px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('countIgnored')}>
                      <div className="ui-th-div ui-jqgrid-sortable">
                        Ігнор {renderSortIndicator('countIgnored')}
                      </div>
                    </th>
                    {showScheduledLocks && (
                      <>
                        <th style={{ width: '130px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('scheduledStart')}>
                          <div className="ui-th-div ui-jqgrid-sortable">
                            Дата блокування з {renderSortIndicator('scheduledStart')}
                          </div>
                        </th>
                        <th style={{ width: '130px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('scheduledEnd')}>
                          <div className="ui-th-div ui-jqgrid-sortable">
                            Дата блокування по {renderSortIndicator('scheduledEnd')}
                          </div>
                        </th>
                        <th style={{ width: '130px', cursor: 'pointer' }} className="ui-th-column ui-th-ltr" onClick={() => handleSort('scheduledObject')}>
                          <div className="ui-th-div ui-jqgrid-sortable">
                            Об'єкт блокування {renderSortIndicator('scheduledObject')}
                          </div>
                        </th>
                      </>
                    )}
                  </tr>

                  {/* Inline filter row with neat uniform heights */}
                  <tr className="ui-search-toolbar" role="row" style={{ height: 26 }}>
                    <th style={{ padding: '2px 4px' }}><div></div></th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <select
                                className="form-control"
                                style={{ height: 22, padding: '1px 3px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.type}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, type: e.target.value })}
                              >
                                <option value="">Всі</option>
                                <option value="usual">Звичайний</option>
                                <option value="corp">Корпорація</option>
                                <option value="corp-member">Член корп.</option>
                              </select>
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('type')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <select
                                className="form-control"
                                style={{ height: 22, padding: '1px 3px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.block}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, block: e.target.value })}
                              >
                                <option value="">Всі</option>
                                <option value="1">Так</option>
                                <option value="0">Ні</option>
                              </select>
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('block')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}><div></div></th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.clCode}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, clCode: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('clCode')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.clName}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, clName: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('clName')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.corpCode}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, corpCode: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('corpCode')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.corpName}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, corpName: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('corpName')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.unionName}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, unionName: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('unionName')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.mngName}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, mngName: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('mngName')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.editDate}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, editDate: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('editDate')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.editUser}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, editUser: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('editUser')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.reason}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, reason: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('reason')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.countUrgent}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, countUrgent: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('countUrgent')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.countOrders}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, countOrders: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('countOrders')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                          </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.sumAllOrders}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, sumAllOrders: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('sumAllOrders')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.countRowsAllOrders}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, countRowsAllOrders: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('countRowsAllOrders')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    <th style={{ padding: '2px 4px' }}>
                      <table className="ui-search-table" style={{ width: '100%' }}>
                        <tbody style={{ width: '100%' }}>
                          <tr>
                            <td className="ui-search-input">
                              <input
                                type="text"
                                className="form-control"
                                style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                value={columnFilters.countIgnored}
                                onChange={(e) => onColumnFilterChange({ ...columnFilters, countIgnored: e.target.value })}
                              />
                            </td>
                            <td className="ui-search-clear">
                              <a className="clearsearchclass" onClick={() => clearColumnFilter('countIgnored')}>x</a>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </th>
                    {showScheduledLocks && (
                      <>
                        <th style={{ padding: '2px 4px' }}>
                          <table className="ui-search-table" style={{ width: '100%' }}>
                            <tbody>
                              <tr>
                                <td className="ui-search-input">
                                  <input
                                    type="text"
                                    className="form-control"
                                    style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                    value={columnFilters.scheduledStart || ''}
                                    onChange={(e) => onColumnFilterChange({ ...columnFilters, scheduledStart: e.target.value })}
                                  />
                                </td>
                                <td className="ui-search-clear">
                                  <a className="clearsearchclass" onClick={() => clearColumnFilter('scheduledStart')}>x</a>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </th>
                        <th style={{ padding: '2px 4px' }}>
                          <table className="ui-search-table" style={{ width: '100%' }}>
                            <tbody>
                              <tr>
                                <td className="ui-search-input">
                                  <input
                                    type="text"
                                    className="form-control"
                                    style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                    value={columnFilters.scheduledEnd || ''}
                                    onChange={(e) => onColumnFilterChange({ ...columnFilters, scheduledEnd: e.target.value })}
                                  />
                                </td>
                                <td className="ui-search-clear">
                                  <a className="clearsearchclass" onClick={() => clearColumnFilter('scheduledEnd')}>x</a>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </th>
                        <th style={{ padding: '2px 4px' }}>
                          <table className="ui-search-table" style={{ width: '100%' }}>
                            <tbody>
                              <tr>
                                <td className="ui-search-input">
                                  <input
                                    type="text"
                                    className="form-control"
                                    style={{ height: 22, padding: '1px 4px', fontSize: 11, borderRadius: 0 }}
                                    value={columnFilters.scheduledObject || ''}
                                    onChange={(e) => onColumnFilterChange({ ...columnFilters, scheduledObject: e.target.value })}
                                  />
                                </td>
                                <td className="ui-search-clear">
                                  <a className="clearsearchclass" onClick={() => clearColumnFilter('scheduledObject')}>x</a>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
              </table>
            </div>
          </div>

          <div className="ui-jqgrid-bdiv" style={{ width: '100%', minHeight: 350 }}>
            <table className="ui-jqgrid-btable ui-common-table table table-bordered" style={{ width: '100%', minWidth: 1480 }}>
              <tbody>
                {pageClients.map((client) => {
                  const isSelected = selectedClientId === client.id;
                  return (
                    <tr
                      key={client.id}
                      id={String(client.id)}
                      className={`jqgrow ui-row-ltr ${isSelected ? 'success' : ''}`}
                      aria-selected={isSelected}
                      onClick={() => onSelectClient(client)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td
                        style={{ width: '31px', textAlign: 'center', cursor: 'pointer', fontWeight: 'bold', color: '#337ab7' }}
                        className="ui-sgcollapsed sgcollapsed"
                        title="Історія блокування"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onOpenHistory) onOpenHistory(client);
                        }}
                      >
                        +
                      </td>
                      <td style={{ width: '68px', textAlign: 'center' }}>
                        {client.type === 'corp-member' ? (
                          <span style={{ padding: '2px 5px', color: '#104e63', backgroundColor: '#e1f5fe', border: '1px solid #b3e5fc', display: 'inline-block', fontSize: 11 }}>
                            Член корп.
                          </span>
                        ) : client.type === 'corp' ? (
                          <span style={{ padding: '2px 5px', color: '#1d456b', backgroundColor: '#e3f2fd', border: '1px solid #bbdefb', display: 'inline-block', fontSize: 11 }}>
                            Корпорація
                          </span>
                        ) : (
                          <span style={{ color: '#666', fontSize: 11 }}>Звичайний</span>
                        )}
                      </td>
                      <td style={{ width: '60px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          {isShownAsBlocked(client.isBlocked, Boolean(getFutureLockDetail(client))) ? (
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
                          {client.isScheduled && (
                            <span
                              title={formatClockTooltip(
                                client.isBlocked,
                                client.scheduledStart || client.lockDetails?.find((d) => d.isScheduled || d.startDate)?.startDate,
                                client.scheduledEnd || client.lockDetails?.find((d) => d.isScheduled || d.endDate)?.endDate
                              )}
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
                      <td style={{ width: '75px', textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-primary changeLock"
                          style={{ padding: '2px 8px', fontSize: 11, borderRadius: 0 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenChangeLock(client);
                          }}
                        >
                          Змінити
                        </button>
                      </td>
                      <td style={{ width: '87px' }}>{client.clCode}</td>
                      <td style={{ width: '190px' }} title={client.clName}>{client.clName}</td>
                      <td style={{ width: '90px' }}>{client.corpCode || '\u00A0'}</td>
                      <td style={{ width: '130px' }} title={client.corpName}>{client.corpName || '\u00A0'}</td>
                      <td style={{ width: '130px' }} title={client.unionName}>{client.unionName || '\u00A0'}</td>
                      <td style={{ width: '120px' }} title={client.mngName}>{client.mngName}</td>
                      <td style={{ width: '95px' }}>{client.editDate}</td>
                      <td style={{ width: '95px' }} title={client.editUser}>{client.editUser}</td>
                      <td style={{ width: '150px', fontSize: 11, lineHeight: 1.35 }}>
                        {client.lockDetails && client.lockDetails.length > 0 ? (
                          client.lockDetails.map((detail, idx) => (
                            <div key={idx} style={{ marginBottom: idx < client.lockDetails!.length - 1 ? 4 : 0 }}>
                              <span
                                style={{
                                  fontWeight: 'bold',
                                  color:
                                    detail.source === 'Клієнт'
                                      ? '#ac2925'
                                      : detail.source === 'Об\'єднання'
                                      ? '#8a6d3b'
                                      : detail.source === 'РСП'
                                      ? '#269abc'
                                      : detail.source === 'Маршрут'
                                      ? '#337ab7'
                                      : '#777'
                                }}
                              >
                                [{detail.source}
                                {detail.groupName ? ` · група «${detail.groupName}»` : ''}]
                              </span>{' '}
                              <span>{detail.reason}</span>
                              {/* рішення 06.10 (Линник А. Т.): майбутнє блокування видно в «Причині» одразу; діюче — без позначки */}
                              {detail.startDate && computeLockTimingState(detail).isFuture && (
                                <span style={{ color: '#a06000', fontSize: 10 }}> (⏱ з {formatToDisplayDateTime(detail.startDate)})</span>
                              )}
                            </div>
                          ))
                        ) : (
                          client.reason || '\u00A0'
                        )}
                      </td>
                      <td style={{ width: '80px', textAlign: 'right' }}>{client.countUrgent !== '' ? client.countUrgent : '\u00A0'}</td>
                      <td style={{ width: '90px', textAlign: 'right' }}>
                        {client.countOrders !== '' ? (
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (onDrilldownBuffer) onDrilldownBuffer(client);
                            }}
                            style={{ color: '#337ab7', fontWeight: 'bold', textDecoration: 'underline' }}
                            title="Переглянути замовлення у черзі (Буфер)"
                          >
                            {client.countOrders}
                          </a>
                        ) : (
                          '\u00A0'
                        )}
                      </td>
                      <td style={{ width: '95px', textAlign: 'right' }}>{client.sumAllOrders || '\u00A0'}</td>
                      <td style={{ width: '90px', textAlign: 'right' }}>{client.countRowsAllOrders !== '' ? client.countRowsAllOrders : '\u00A0'}</td>
                      <td style={{ width: '70px', textAlign: 'right' }}>
                        {client.countIgnored !== '' && Number(client.countIgnored) > 0 ? (
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (onDrilldownBuffer) onDrilldownBuffer(client, true);
                            }}
                            style={{ color: '#d9534f', fontWeight: 'bold', textDecoration: 'underline' }}
                            title="Переглянути ігноровані замовлення в буфері"
                          >
                            {client.countIgnored}
                          </a>
                        ) : client.countIgnored !== '' ? (
                          client.countIgnored
                        ) : (
                          '\u00A0'
                        )}
                      </td>
                      {showScheduledLocks && (
                        <>
                          {/* Ф2 п.2: період саме запланованого (майбутнього) блокування */}
                          <td style={{ width: '130px', textAlign: 'center' }}>{formatToDisplayDateTime(getFutureLockDetail(client)?.startDate) || '—'}</td>
                          <td style={{ width: '130px', textAlign: 'center' }}>{formatToDisplayDateTime(getFutureLockDetail(client)?.endDate) || '—'}</td>
                          <td style={{ width: '130px', textAlign: 'center' }}>
                            {(() => {
                              const obj = getScheduledObject(client);
                              return (
                                <span
                                  style={{
                                    padding: '2px 6px',
                                    fontSize: 11,
                                    fontWeight: 'bold',
                                    borderRadius: 2,
                                    display: 'inline-block',
                                    backgroundColor:
                                      obj === 'Клієнт'
                                        ? '#e8f4fd'
                                        : obj === 'Об\'єднання'
                                        ? '#fcf8e3'
                                        : obj === 'РСП'
                                        ? '#e1f5fe'
                                        : obj === 'Маршрут'
                                        ? '#ede7f6'
                                        : '#f5f5f5',
                                    color:
                                      obj === 'Клієнт'
                                        ? '#1a568c'
                                        : obj === 'Об\'єднання'
                                        ? '#8a6d3b'
                                        : obj === 'РСП'
                                        ? '#0277bd'
                                        : obj === 'Маршрут'
                                        ? '#4a148c'
                                        : '#333',
                                    border: `1px solid ${
                                      obj === 'Клієнт'
                                        ? '#b8daff'
                                        : obj === 'Об\'єднання'
                                        ? '#faebcc'
                                        : obj === 'РСП'
                                        ? '#b3e5fc'
                                        : obj === 'Маршрут'
                                        ? '#d1c4e9'
                                        : '#ddd'
                                    }`
                                  }}
                                >
                                  {obj}
                                </span>
                              );
                            })()}
                            {/* Р1 (п. 3.b): ознака «група», якщо блокування заплановане на групу */}
                            {getFutureLockDetail(client)?.groupName && (
                              <div style={{ fontSize: 10, color: '#6f42c1', marginTop: 2 }}>
                                група «{getFutureLockDetail(client)?.groupName}»
                              </div>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pager */}
        <div id="pager" className="ui-jqgrid-pager" dir="ltr" style={{ width: '100%' }}>
          <div className="ui-pager-control" role="group">
            <table className="ui-pg-table ui-common-table ui-pager-table table" style={{ margin: 0 }}>
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
                              <option value={10}>10</option>
                              <option value={20}>20</option>
                              <option value={30}>30</option>
                            </select>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </td>
                  <td id="pager_right" align="right" style={{ width: '30%' }}>
                    <div className="ui-paging-info" style={{ textAlign: 'right' }}>
                      Перегляд {sortedClients.length === 0 ? 0 : startIndex + 1} - {Math.min(startIndex + pageSize, sortedClients.length)} з {sortedClients.length}
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
