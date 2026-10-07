import React, { useState, useEffect } from 'react';
import { useDraggableDialog } from '../utils/useDraggableDialog';
import { DateTimeInput } from './DateTimeInput';
import { EntityRegistryRow, EntityType } from '../types';
import { MANUAL_BLOCKING_REASONS } from '../data/mockData';
import { formatToDisplayDateTime, validatePeriod } from '../utils/lockTiming';

interface ChangeObjectLockModalProps {
  row: EntityRegistryRow | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    targetType: EntityType,
    targetCode: string,
    targetName: string,
    isBlocked: boolean,
    reason: string,
    startDate?: string,
    endDate?: string
  ) => void;
  // перевірка перетину з іншими записами цього об'єкта (Д1 розд. 2); повертає текст помилки або ''
  checkOverlap?: (row: EntityRegistryRow, startDate?: string, endDate?: string) => string;
}

export const ChangeObjectLockModal: React.FC<ChangeObjectLockModalProps> = ({
  row,
  isOpen,
  onClose,
  onSave,
  checkOverlap
}) => {
  const [isBlocked, setIsBlocked] = useState<boolean>(true);
  const [reason, setReason] = useState<string>('Блокування НКЦ');
  const [isScheduled, setIsScheduled] = useState<boolean>(false);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  // В8: вікно перетягується за заголовок; при кожному відкритті — на звичайному місці
  const drag = useDraggableDialog();
  useEffect(() => {
    if (isOpen) drag.reset();
  }, [isOpen, drag.reset]);

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

  useEffect(() => {
    if (row) {
      setIsBlocked(row.isBlocked || Boolean(row.isScheduled));
      if (row.reason && (MANUAL_BLOCKING_REASONS as readonly string[]).includes(row.reason)) {
        setReason(row.reason);
      } else {
        // К 05.10: «НКЦ блокує автоімпорт, як правило, по причині «Блокування НКЦ»»
        setReason('Блокування НКЦ');
      }

      const hasActualPeriod = Boolean((row.startDate && row.startDate.trim()) || (row.endDate && row.endDate.trim()));
      setIsScheduled(Boolean(row.isScheduled && hasActualPeriod));
      setStartDate(formatToInputDate(row.startDate));
      setEndDate(formatToInputDate(row.endDate));
    }
  }, [row, isOpen]); // при кожному відкритті — поточні значення запису (Д1 розд. 4), без незбережених правок минулого разу

  if (!isOpen || !row) return null;

  const handleSave = () => {
    const finalReason = isBlocked ? (reason || 'Блокування НКЦ') : '';

    const formattedStartDate = isBlocked && isScheduled ? formatFromInputDate(startDate) : undefined;
    const formattedEndDate = isBlocked && isScheduled ? formatFromInputDate(endDate) : undefined;
    const err = isBlocked
      ? validatePeriod(formattedStartDate, formattedEndDate) || (checkOverlap ? checkOverlap(row, formattedStartDate, formattedEndDate) : '')
      : '';
    if (err) {
      window.alert(err);
      return;
    }

    onSave(
      row.type,
      String(row.code),
      row.name,
      isBlocked,
      finalReason,
      formattedStartDate,
      formattedEndDate
    );
    onClose();
  };

  return (
    <>
      <div
        className="modal in"
        id="changeObjectLockModal"
        role="dialog"
        style={{ display: 'block', zIndex: 1060 }}
        aria-modal="true"
      >
        <div className="modal-dialog modal-md" role="document" style={drag.dialogStyle}>
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
                Зміна блокування: {row.type} &laquo;{row.name}&raquo;
              </h4>
              <button
                type="button"
                className="close"
                onClick={onClose}
                style={{ color: '#fff', opacity: 0.8, fontSize: 20, marginTop: -2 }}
              >
                <span>&times;</span>
              </button>
            </div>

            {/* Body */}
            <div className="modal-body" style={{ padding: 18, backgroundColor: '#fdfdfd' }}>
              {/* Summary Banner */}
              <div
                style={{
                  backgroundColor: '#f5f5f5',
                  border: '1px solid #e3e3e3',
                  padding: '8px 12px',
                  marginBottom: 16,
                  fontSize: 12
                }}
              >
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ color: '#666' }}>Тип об'єкта: </span>
                    <strong style={{ color: '#333' }}>{row.type}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#666' }}>Назва: </span>
                    <strong style={{ color: '#333' }}>{row.name}</strong>
                  </div>
                </div>
              </div>

              {/* Status Section */}
              <div
                style={{
                  border: '1px solid #d5d5d5',
                  padding: '14px 16px',
                  backgroundColor: '#fff',
                  marginBottom: 14
                }}
              >
                <div
                  style={{
                    fontWeight: 'bold',
                    fontSize: 13,
                    color: '#333',
                    marginBottom: 10,
                    borderBottom: '1px solid #eee',
                    paddingBottom: 4
                  }}
                >
                  1. Стан блокування об'єкта
                </div>

                <div style={{ display: 'flex', gap: 24, marginBottom: 14 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: isBlocked ? 'bold' : 'normal',
                      color: isBlocked ? '#a94442' : '#333'
                    }}
                  >
                    <input
                      type="radio"
                      name="objIsBlocked"
                      checked={isBlocked}
                      onChange={() => setIsBlocked(true)}
                    />
                    <span>Заблокувати</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      fontSize: 13,
                      fontWeight: !isBlocked ? 'bold' : 'normal',
                      color: !isBlocked ? '#2e6b30' : '#333'
                    }}
                  >
                    <input
                      type="radio"
                      name="objIsBlocked"
                      checked={!isBlocked}
                      onChange={() => setIsBlocked(false)}
                    />
                    <span>Розблокувати</span>
                  </label>
                </div>

                {/* Reason Section */}
                {isBlocked && (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#444' }}>
                      Причина блокування:
                    </label>
                    <select
                      className="form-control input-sm"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      style={{ height: 30, borderRadius: 0 }}
                    >
                      {MANUAL_BLOCKING_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Scheduled Lock Section */}
              {isBlocked && (
                <div
                  style={{
                    border: '1px solid #d5d5d5',
                    padding: '14px 16px',
                    backgroundColor: '#fff',
                    marginBottom: 14
                  }}
                >
                  <div
                    style={{
                      fontWeight: 'bold',
                      fontSize: 13,
                      color: '#333',
                      marginBottom: 8,
                      borderBottom: '1px solid #eee',
                      paddingBottom: 4
                    }}
                  >
                    2. Період дії (заплановане блокування)
                  </div>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      cursor: 'pointer',
                      fontWeight: isScheduled ? 600 : 'normal',
                      color: isScheduled ? '#8a6d3b' : '#555',
                      marginBottom: 10
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isScheduled}
                      onChange={(e) => setIsScheduled(e.target.checked)}
                    />
                    <span>Встановити період дії (відображається з іконкою ⏱)</span>
                  </label>

                  {isScheduled && (
                    <div className="row" style={{ marginTop: 8 }}>
                      <div className="col-xs-6">
                        <label style={{ fontSize: 11, color: '#666', marginBottom: 2, display: 'block' }}>
                          Початок дії:
                        </label>
                        <DateTimeInput
                          className="form-control input-sm"
                          value={startDate}
                          onChange={setStartDate}
                          style={{ height: 28, fontSize: 11, borderRadius: 0 }}
                        />
                      </div>
                      <div className="col-xs-6">
                        <label style={{ fontSize: 11, color: '#666', marginBottom: 2, display: 'block' }}>
                          Кінець дії:
                        </label>
                        <DateTimeInput
                          className="form-control input-sm"
                          value={endDate}
                          onChange={setEndDate}
                          style={{ height: 28, fontSize: 11, borderRadius: 0 }}
                        />
                      </div>
                      {/* В7: очистити обидві дати одним кліком */}
                      <div className="col-xs-12" style={{ textAlign: 'right', marginTop: 6 }}>
                        <button
                          type="button"
                          className="btn btn-default btn-xs"
                          onClick={() => { setStartDate(''); setEndDate(''); }}
                          title="Очистити обидві дати одним кліком"
                          style={{ borderRadius: 0, fontSize: 11, padding: '2px 10px' }}
                        >
                          Очистити
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Informational hint */}
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#f9f9f9',
                  border: '1px solid #e5e5e5',
                  fontSize: 11,
                  color: '#666',
                  lineHeight: 1.4
                }}
              >
                ℹ️ Блокування даного об'єкта діє на всі пов'язані замовлення та клієнтів.
                {row.countOrders !== '' && row.countOrders !== 0 && (
                  <span style={{ fontWeight: 'bold', color: '#a94442', display: 'block', marginTop: 3 }}>
                    Пов'язаних замовлень: {row.countOrders} на суму {row.sumOrders} грн.
                  </span>
                )}
              </div>
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
                onClick={onClose}
                style={{
                  borderRadius: 0,
                  padding: '6px 18px',
                  borderColor: '#ccc',
                  backgroundColor: '#fff',
                  color: '#333',
                  fontSize: 12
                }}
              >
                Вихід
              </button>
              <button
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
    </>
  );
};
