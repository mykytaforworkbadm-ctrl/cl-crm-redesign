import React, { useState } from 'react';
import { QueueOrder, QueueColumnFilters, ClientRecord } from '../types';
import { QUEUE_ORDERS } from '../data/mockData';

interface QueueOrdersModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: ClientRecord | null;
}

export const QueueOrdersModal: React.FC<QueueOrdersModalProps> = ({
  isOpen,
  onClose,
  client
}) => {
  const [selectedOrderIds, setSelectedOrderIds] = useState<number[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
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

  // Resizing state (Requirement 2.1)
  const [dimensions, setDimensions] = useState({ width: 1100, height: 620 });

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = dimensions.width;
    const startH = dimensions.height;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newW = Math.max(700, Math.min(window.innerWidth - 30, startW + (moveEvent.clientX - startX)));
      const newH = Math.max(450, Math.min(window.innerHeight - 40, startH + (moveEvent.clientY - startY)));
      setDimensions({ width: newW, height: newH });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  if (!isOpen) return null;

  // Filter orders by client if client is given, or show matching queue orders
  const clientOrders = client
    ? QUEUE_ORDERS.filter((o) => o.clientCode === client.clCode || client.clCode === '43639' || o.clientName.includes(client.clName))
    : QUEUE_ORDERS;

  const filteredOrders = (clientOrders.length > 0 ? clientOrders : QUEUE_ORDERS).filter((o) => {
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
    if (columnFilters.pending && !o.pending.toLowerCase().includes(columnFilters.pending.toLowerCase())) return false;
    if (columnFilters.urgentazh && !o.urgentazh.toLowerCase().includes(columnFilters.urgentazh.toLowerCase())) return false;
    if (columnFilters.orderCountRows && !String(o.orderCountRows).includes(columnFilters.orderCountRows)) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const pageIndex = Math.min(currentPage, totalPages);
  const startIndex = (pageIndex - 1) * pageSize;
  const pageOrders = filteredOrders.slice(startIndex, startIndex + pageSize);

  const toggleSelectAll = () => {
    if (selectedOrderIds.length === pageOrders.length) {
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

  const clearColumnFilter = (key: keyof QueueColumnFilters) => {
    setColumnFilters({
      ...columnFilters,
      [key]: ''
    });
  };

  return (
    <>
      <div
        className="modal fade in"
        id="modal_blocking_orders"
        style={{ zIndex: 1055, display: 'block' }}
        role="dialog"
      >
        <div className="modal-dialog block_orders" style={{ width: `${dimensions.width}px`, maxWidth: '96vw', marginTop: 20 }}>
          <div className="modal-content panel panel-info" style={{ position: 'relative' }}>
            <div className="modal-header panel-heading">
              <h4 className="modal-title">Замовлення</h4>
              <button
                className="close"
                type="button"
                onClick={onClose}
                aria-hidden="true"
              >
                ×
              </button>
            </div>

            <div className="modal-body" style={{ padding: 12 }}>
              <div className="panel panel-primary" style={{ marginBottom: 0 }}>
                <div className="panel-heading" style={{ fontSize: 15, fontWeight: 'bold' }}>
                  Замовлення у черзі
                </div>
                <div className="panel-body" style={{ padding: 8 }}>
                  <div style={{ overflow: 'auto', overflowX: 'auto' }}>
                    <div className="ui-jqgrid" id="gbox_blockorders" dir="ltr" style={{ width: '100%' }}>
                      <div className="ui-jqgrid-view table-responsive" role="grid" id="gview_blockorders" style={{ width: '100%' }}>
                        <div className="ui-jqgrid-hdiv" style={{ width: '100%' }}>
                          <div className="ui-jqgrid-hbox">
                            <table className="ui-jqgrid-htable ui-common-table table table-bordered" style={{ width: '100%', minWidth: 1200 }}>
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
                                  <th style={{ width: '120px' }} className="ui-th-column ui-th-ltr">
                                    <div className="ui-th-div">Кліент</div>
                                  </th>
                                  <th style={{ width: '80px' }} className="ui-th-column ui-th-ltr">
                                    <div className="ui-th-div">Код кліента</div>
                                  </th>
                                  <th style={{ width: '90px' }} className="ui-th-column ui-th-ltr">
                                    <div className="ui-th-div">Маршрут</div>
                                  </th>
                                  <th style={{ width: '80px' }} className="ui-th-column ui-th-ltr">
                                    <div className="ui-th-div">Код підрозділу</div>
                                  </th>
                                  <th style={{ width: '160px' }} className="ui-th-column ui-th-ltr">
                                    <div className="ui-th-div">Назва підрозділу</div>
                                  </th>
                                  <th style={{ width: '110px' }} className="ui-th-column ui-th-ltr">
                                    <div className="ui-th-div">Файл заявки</div>
                                  </th>
                                  <th style={{ width: '120px' }} className="ui-th-column ui-th-ltr">
                                    <div className="ui-th-div">Менеджер</div>
                                  </th>
                                  <th style={{ width: '95px' }} className="ui-th-column ui-th-ltr">
                                    <div className="ui-th-div">Сума замовлення</div>
                                  </th>
                                  <th style={{ width: '70px' }} className="ui-th-column ui-th-ltr">
                                    <div className="ui-th-div">Ігнорування</div>
                                  </th>
                                  <th style={{ width: '65px' }} className="ui-th-column ui-th-ltr">
                                    <div className="ui-th-div">Ургентаж</div>
                                  </th>
                                  <th style={{ width: '95px' }} className="ui-th-column ui-th-ltr">
                                    <div className="ui-th-div">Кількість позицій</div>
                                  </th>
                                </tr>

                                {/* Inline filter row */}
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
                                            <input
                                              type="text"
                                              className="form-control"
                                              value={columnFilters.pending}
                                              onChange={(e) => setColumnFilters({ ...columnFilters, pending: e.target.value })}
                                            />
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
                                          onClick={(e) => e.preventDefault()}
                                          style={{ color: '#337ab7', textDecoration: 'underline' }}
                                        >
                                          {order.fileName}
                                        </a>
                                      </td>
                                      <td title={order.managerName}>{order.managerName}</td>
                                      <td style={{ textAlign: 'right' }}>{order.orderedSum.toFixed(2)}</td>
                                      <td style={{ textAlign: 'center' }}>{order.pending}</td>
                                      <td style={{ textAlign: 'center' }}>{order.urgentazh}</td>
                                      <td style={{ textAlign: 'right' }}>{order.orderCountRows}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Pager */}
                        <div id="blockorders_pager" className="ui-jqgrid-pager" dir="ltr" style={{ width: '100%' }}>
                          <div className="ui-pager-control" role="group">
                            <table className="ui-pg-table ui-common-table ui-pager-table table" style={{ margin: 0 }}>
                              <tbody>
                                <tr>
                                  <td id="blockorders_pager_left" align="left" style={{ width: '25%' }}>
                                    <table className="ui-pg-table navtable ui-common-table" style={{ margin: 0 }}>
                                      <tbody>
                                        <tr>
                                          <td className="ui-pg-button" title="Змінити ігнорування">
                                            <div className="ui-pg-div" style={{ padding: '0 4px', fontWeight: 'bold' }}>
                                              <span>▦</span>
                                            </div>
                                          </td>
                                          <td className="ui-pg-button" title="Оновити">
                                            <div className="ui-pg-div" style={{ padding: '0 4px' }}>
                                              <span>↻</span>
                                            </div>
                                          </td>
                                          <td className="ui-pg-button" title="Видалити">
                                            <div className="ui-pg-div" style={{ padding: '0 4px' }}>
                                              <span>−</span>
                                            </div>
                                          </td>
                                          <td className="ui-pg-button" title="Видалити все">
                                            <div className="ui-pg-div" style={{ padding: '0 4px' }}>
                                              <span>≡</span>
                                            </div>
                                          </td>
                                          <td className="ui-pg-button" title="Export">
                                            <div className="ui-pg-div" style={{ padding: '0 4px' }}>
                                              <span>⤓</span>
                                            </div>
                                          </td>
                                        </tr>
                                      </tbody>
                                    </table>
                                  </td>

                                  <td id="blockorders_pager_center" align="center" style={{ whiteSpace: 'pre', width: '370px' }}>
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
                                          <td id="input_blockorders_pager" dir="ltr">
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

                                  <td id="blockorders_pager_right" align="right" style={{ width: '25%' }}>
                                    <div className="ui-paging-info" style={{ textAlign: 'right' }}>
                                      Перегляд {filteredOrders.length === 0 ? 0 : startIndex + 1} - {Math.min(startIndex + pageSize, filteredOrders.length)} з {filteredOrders.length}
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

            <div className="modal-footer" style={{ padding: '10px 15px' }}>
              <button className="btn btn-default" type="button" onClick={onClose}>
                Закрити
              </button>
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
    </>
  );
};
