/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientRecord, HistoryEntry, ObjectLockRecord } from '../types';
import { formatToDisplayDateTime, parseDateStringToMs } from '../utils/lockTiming';

/**
 * Р4: початкове наповнення вікна «Історія» (тестові дані прототипу).
 * 1) Для кожного блокування з тестових даних — записи, які дав би його життєвий цикл:
 *    встановлення («Обновление»), увімкнення / вимкнення за розкладом («Планувальник»), якщо момент уже настав.
 * 2) Приклади, що відтворюють сценарії тестування бізнесу 30.09–02.10 (коментарі 05.10):
 *    О_АстраЗенека 30.09 13:00–15:00 і 02.10 15:00–15:10; група маршрутів BT_DN_03…07 30.09 16:30–16:40.
 * Записи мають той самий формат, що й записи, які прототип створює під час роботи (App.tsx, logHistoryDiff).
 */

type Event = { at: number; rows: HistoryEntry[] };

const pad = (n: number) => String(n).padStart(2, '0');
const stampOf = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const dateOnly = (ms: number) => stampOf(ms).split(',')[0];

interface LockLife {
  reason: string;
  setAt: number | null; // коли блокування встановлено (дата змін)
  startDate?: string;
  endDate?: string;
  prevEditDate?: string; // попереднє значення EDIT_DATE ('' — не було)
}

// Події життєвого циклу одного блокування до моменту now
const lifeEvents = (life: LockLife, now: number): Event[] => {
  const events: Event[] = [];
  const start = parseDateStringToMs(life.startDate);
  const end = parseDateStringToMs(life.endDate);
  const from = life.startDate ? formatToDisplayDateTime(life.startDate) : '';
  const to = life.endDate ? formatToDisplayDateTime(life.endDate) : '';
  if (life.setAt !== null && life.setAt <= now) {
    const s = stampOf(life.setAt);
    const rows: HistoryEntry[] = [
      { action: 'Обновление', date: s, field: 'BLOCKING_REASON', oldValue: '—', newValue: life.reason },
      { action: 'Обновление', date: s, field: 'EDIT_DATE', oldValue: life.prevEditDate || '—', newValue: dateOnly(life.setAt) }
    ];
    const activeAtSet = start === null || start <= life.setAt;
    if (activeAtSet && (end === null || end > life.setAt)) rows.push({ action: 'Обновление', date: s, field: 'VALUE', oldValue: '0', newValue: '1' });
    if (from) rows.push({ action: 'Обновление', date: s, field: 'BLOCK_DATE_FROM', oldValue: '—', newValue: from });
    if (to) rows.push({ action: 'Обновление', date: s, field: 'BLOCK_DATE_TO', oldValue: '—', newValue: to });
    events.push({ at: life.setAt, rows });
  }
  if (start !== null && start <= now && (life.setAt === null || start > life.setAt)) {
    events.push({ at: start, rows: [{ action: 'Планувальник', date: stampOf(start), field: 'VALUE', oldValue: '0', newValue: '1' }] });
  }
  if (end !== null && end <= now) {
    const s = stampOf(end);
    events.push({
      at: end,
      rows: [
        { action: 'Планувальник', date: s, field: 'VALUE', oldValue: '1', newValue: '0' },
        ...(from ? [{ action: 'Планувальник', date: s, field: 'BLOCK_DATE_FROM', oldValue: from, newValue: '—' }] : []),
        ...(to ? [{ action: 'Планувальник', date: s, field: 'BLOCK_DATE_TO', oldValue: to, newValue: '—' }] : [])
      ]
    });
  }
  return events;
};

export const buildHistorySeed = (
  clients: ClientRecord[],
  locks: ObjectLockRecord[],
  nowDate: Date = new Date()
): Record<string, HistoryEntry[]> => {
  const now = nowDate.getTime();
  const byKey: Record<string, Event[]> = {};
  const add = (key: string, events: Event[]) => {
    if (events.length) byKey[key] = [...(byKey[key] || []), ...events];
  };

  // 1. Блокування з тестових даних
  clients.forEach((c) => {
    const own = c.lockDetails?.find((d) => d.source === 'Клієнт');
    if (!own) return;
    add(`client:${c.id}`, lifeEvents({ reason: own.reason, setAt: parseDateStringToMs(c.editDate), startDate: own.startDate, endDate: own.endDate }, now));
  });
  locks.forEach((l) => {
    add(`obj:${l.targetType}:${l.targetCode}`, lifeEvents({ reason: l.reason, setAt: parseDateStringToMs(l.lockDate), startDate: l.startDate, endDate: l.endDate }, now));
  });

  // 2. Приклади за сценаріями тестування бізнесу (час планування — орієнтовний; 16:28 — зі слів бізнесу)
  const astra = 'obj:Об\'єднання:34';
  add(astra, lifeEvents({ reason: 'Блокування НКЦ', setAt: parseDateStringToMs('30.09.2026 12:45:00'), startDate: '30.09.2026 13:00', endDate: '30.09.2026 15:00' }, now));
  add(astra, lifeEvents({ reason: 'Блокування НКЦ', setAt: parseDateStringToMs('02.10.2026 14:50:00'), startDate: '02.10.2026 15:00', endDate: '02.10.2026 15:10', prevEditDate: '30.09.2026' }, now));
  // у другому плануванні причина та сама — запис BLOCKING_REASON не потрібен
  if (byKey[astra]) {
    const second = byKey[astra].find((e) => stampOf(e.at).startsWith('02.10.2026, 14:50'));
    if (second) second.rows = second.rows.filter((r) => r.field !== 'BLOCKING_REASON');
  }
  ['1266', '1507', '1405', '1406', '1460'].forEach((code) => {
    add(`obj:Маршрут:${code}`, lifeEvents({ reason: 'Блокування НКЦ', setAt: parseDateStringToMs('30.09.2026 16:28:00'), startDate: '30.09.2026 16:30', endDate: '30.09.2026 16:40' }, now));
  });

  const result: Record<string, HistoryEntry[]> = {};
  Object.entries(byKey).forEach(([key, events]) => {
    result[key] = events.sort((a, b) => a.at - b.at).flatMap((e) => e.rows);
  });
  return result;
};
