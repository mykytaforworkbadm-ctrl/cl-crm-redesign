/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ClientRecord, EntityRegistryRow, LockDetail, ObjectLockRecord } from '../types';

/**
 * Parses date string in various formats:
 * - YYYY-MM-DDTHH:mm or ISO
 * - DD.MM.YYYY HH:mm:ss
 * - DD.MM.YYYY HH:mm
 * - DD.MM.YYYY
 * - DD.MM HH:mm (uses defaultYear or current year)
 * - DD.MM (uses defaultYear or current year)
 */
export function parseDateStringToMs(dateStr?: string, defaultYear?: number): number | null {
  if (!dateStr || !dateStr.trim()) return null;
  const str = dateStr.trim();

  // YYYY-MM-DDTHH:mm or ISO format
  if (str.includes('T')) {
    const ms = Date.parse(str);
    if (!isNaN(ms)) return ms;
  }

  // DD.MM.YYYY or DD.MM format
  if (str.includes('.')) {
    const parts = str.split(' ');
    const dateParts = parts[0].split('.');
    const day = parseInt(dateParts[0], 10);
    const month = parseInt(dateParts[1], 10) - 1;
    let year = dateParts[2] ? parseInt(dateParts[2], 10) : (defaultYear ?? new Date().getFullYear());
    if (year < 100) year += 2000;

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
    if (!isNaN(d.getTime())) return d.getTime();
  }

  const fallback = Date.parse(str);
  return isNaN(fallback) ? null : fallback;
}

/**
 * Formats date and time string into standard Ukrainian format: DD.MM.YYYY HH:mm
 * Handles:
 * - YYYY-MM-DDTHH:mm or ISO
 * - YYYY-MM-DD HH:mm
 * - DD.MM.YYYY HH:mm:ss -> DD.MM.YYYY HH:mm
 * - DD.MM.YYYY HH:mm
 * - DD.MM HH:mm -> DD.MM.YYYY HH:mm
 * - DD.MM.YYYY -> DD.MM.YYYY
 */
export function formatToDisplayDateTime(dStr?: string, defaultYear = 2026): string {
  if (!dStr || !dStr.trim()) return '';
  const str = dStr.trim();

  // If ISO with 'T': 2026-09-30T16:30 or 2026-09-30T16:30:00
  if (str.includes('T')) {
    const [datePart, timePart] = str.split('T');
    const ymd = datePart.split('-');
    if (ymd.length === 3) {
      const day = ymd[2].padStart(2, '0');
      const month = ymd[1].padStart(2, '0');
      const year = ymd[0];
      const time = timePart ? timePart.slice(0, 5) : '00:00';
      return `${day}.${month}.${year} ${time}`;
    }
  }

  // If YYYY-MM-DD HH:mm or YYYY-MM-DD
  if (str.includes('-')) {
    const parts = str.split(' ');
    const ymd = parts[0].split('-');
    if (ymd.length === 3) {
      const day = ymd[2].padStart(2, '0');
      const month = ymd[1].padStart(2, '0');
      const year = ymd[0];
      const time = parts[1] ? parts[1].slice(0, 5) : '00:00';
      return `${day}.${month}.${year} ${time}`;
    }
  }

  // If DD.MM.YYYY HH:mm or DD.MM.YYYY HH:mm:ss or DD.MM.YYYY or DD.MM HH:mm
  if (str.includes('.')) {
    const parts = str.split(' ');
    const dParts = parts[0].split('.');
    const day = dParts[0].padStart(2, '0');
    const month = dParts[1].padStart(2, '0');
    let year = dParts[2] ? (dParts[2].length === 2 ? `20${dParts[2]}` : dParts[2]) : String(defaultYear);
    const time = parts[1] ? parts[1].slice(0, 5) : '';
    return time ? `${day}.${month}.${year} ${time}` : `${day}.${month}.${year}`;
  }

  return str;
}

/**
 * Text for clock icon tooltip (⏱):
 * - блок ще не почався: «Заплановано: з дд.мм.рррр гг:хх по дд.мм.рррр гг:хх»;
 * - блок діє за розкладом: «Увімкнено за розкладом: з дд.мм.рррр гг:хх по дд.мм.рррр гг:хх»;
 * - якщо дати «по» немає: «… з дд.мм.рррр гг:хх, безстроково».
 */
export function formatClockTooltip(
  isBlocked: boolean,
  startDate?: string,
  endDate?: string
): string {
  const start = formatToDisplayDateTime(startDate);
  const end = formatToDisplayDateTime(endDate);

  const prefix = isBlocked ? 'Увімкнено за розкладом:' : 'Заплановано:';

  if (start && end) {
    return `${prefix} з ${start} по ${end}`;
  }
  if (start && !end) {
    return `${prefix} з ${start}, безстроково`;
  }
  if (!start && end) {
    return `${prefix} по ${end}`;
  }
  return `${prefix} за розкладом`;
}

export interface LockTimingResult {
  isBlocked: boolean; // "Так" (true) vs "Ні" (false)
  isScheduled: boolean; // Has clock icon ⏱
  isExpired: boolean; // Period has ended; record disappears from scheduled and object registry
  isFuture: boolean; // Period has not started yet
  isActive: boolean; // Currently active inside period or permanent
  statusLabel: 'Заплановане' | 'Активне' | 'Завершене';
}

/**
 * Computes lock status based on start/end dates and current time:
 * - період ще не почався: «Ні» + іконка годинника (заплановане)
 * - поточний час всередині періоду: «Так». Годинник лишається, якщо блокування увімкнене за розкладом
 * - період завершився: «Ні», без годинника. Запис зникає зі списку запланованих і з реєстру блокувань об'єктів
 * - Блокування без дати «по» — безстрокове: «Так» з моменту «з»
 * - Блокування без дат — постійне активне: «Так», без годинника
 */
export function computeLockTimingState(
  lock: { startDate?: string; endDate?: string; isScheduled?: boolean } | null | undefined,
  now: Date = new Date()
): LockTimingResult {
  if (!lock) {
    return {
      isBlocked: false,
      isScheduled: false,
      isExpired: false,
      isFuture: false,
      isActive: false,
      statusLabel: 'Завершене'
    };
  }

  const hasDates = Boolean(lock.startDate || lock.endDate);
  const isScheduled = Boolean(lock.isScheduled || hasDates);

  // Permanent lock with no schedule / dates
  if (!isScheduled && !hasDates) {
    return {
      isBlocked: true,
      isScheduled: false,
      isExpired: false,
      isFuture: false,
      isActive: true,
      statusLabel: 'Активне'
    };
  }

  const nowMs = now.getTime();
  const startMs = parseDateStringToMs(lock.startDate);
  const endMs = parseDateStringToMs(lock.endDate);

  // 1. Період завершився: «Ні», без годинника. Запис зникає зі списку запланованих і з реєстру
  if (endMs !== null && nowMs > endMs) {
    return {
      isBlocked: false,
      isScheduled: false,
      isExpired: true,
      isFuture: false,
      isActive: false,
      statusLabel: 'Завершене'
    };
  }

  // 2. Період ще не почався: «Ні» + іконка годинника (заплановане)
  if (startMs !== null && nowMs < startMs) {
    return {
      isBlocked: false,
      isScheduled: true,
      isExpired: false,
      isFuture: true,
      isActive: false,
      statusLabel: 'Заплановане'
    };
  }

  // 3. Поточний час всередині періоду (або безстрокове з моменту startDate):
  // «Так». Годинник лишається, якщо блокування увімкнене за розкладом
  return {
    isBlocked: true,
    isScheduled: isScheduled,
    isExpired: false,
    isFuture: false,
    isActive: true,
    statusLabel: 'Активне'
  };
}

/**
 * Recomputes client status and lock details by cascading from active object locks
 * and client's own direct locks according to the current time.
 */
export function recomputeClientLocks(
  client: ClientRecord,
  activeObjectLocks: ObjectLockRecord[],
  now: Date = new Date()
): ClientRecord {
  const existingDetails = client.lockDetails || [];

  // 1. Evaluate client direct locks (source: 'Клієнт')
  const clientDirectDetails = existingDetails.filter((d) => d.source === 'Клієнт');
  const validDirectDetails = clientDirectDetails.filter((d) => {
    const timing = computeLockTimingState(d, now);
    return !timing.isExpired;
  });

  // Preserve non-standard sources if any
  const otherDetails = existingDetails.filter(
    (d) => !['Клієнт', 'Об\'єднання', 'РСП', 'Склад', 'Маршрут'].includes(d.source)
  ).filter((d) => !computeLockTimingState(d, now).isExpired);

  // 2. Cascade from activeObjectLocks
  const applicableObjectLocks: LockDetail[] = [];

  // Union
  const unionLock = activeObjectLocks.find(
    (l) =>
      l.targetType === 'Об\'єднання' &&
      ((client.unionId && l.targetCode === String(client.unionId)) ||
        (client.unionName && l.targetName.toLowerCase() === client.unionName.toLowerCase()))
  );
  if (unionLock) {
    const timing = computeLockTimingState(unionLock, now);
    if (!timing.isExpired) {
      applicableObjectLocks.push({
        source: 'Об\'єднання',
        reason: unionLock.reason,
        startDate: unionLock.startDate,
        endDate: unionLock.endDate,
        isScheduled: unionLock.isScheduled
      });
    }
  }

  // RSP
  const rspLock = activeObjectLocks.find(
    (l) =>
      l.targetType === 'РСП' &&
      ((client.rspId && l.targetCode === String(client.rspId)) ||
        (client.rspName && l.targetName.toLowerCase() === client.rspName.toLowerCase()))
  );
  if (rspLock) {
    const timing = computeLockTimingState(rspLock, now);
    if (!timing.isExpired) {
      applicableObjectLocks.push({
        source: 'РСП',
        reason: rspLock.reason,
        startDate: rspLock.startDate,
        endDate: rspLock.endDate,
        isScheduled: rspLock.isScheduled
      });
    }
  }

  // Dept / Warehouse
  const deptLock = activeObjectLocks.find(
    (l) =>
      l.targetType === 'Склад' &&
      ((client.deptId && l.targetCode === String(client.deptId)) ||
        (client.deptName && l.targetName.toLowerCase() === client.deptName.toLowerCase()))
  );
  if (deptLock) {
    const timing = computeLockTimingState(deptLock, now);
    if (!timing.isExpired) {
      applicableObjectLocks.push({
        source: 'Склад',
        reason: deptLock.reason,
        startDate: deptLock.startDate,
        endDate: deptLock.endDate,
        isScheduled: deptLock.isScheduled
      });
    }
  }

  // Route
  const routeLock = activeObjectLocks.find(
    (l) =>
      l.targetType === 'Маршрут' &&
      ((client.routeId && l.targetCode === String(client.routeId)) ||
        (client.routeName && l.targetName.toLowerCase() === client.routeName.toLowerCase()))
  );
  if (routeLock) {
    const timing = computeLockTimingState(routeLock, now);
    if (!timing.isExpired) {
      applicableObjectLocks.push({
        source: 'Маршрут',
        reason: routeLock.reason,
        startDate: routeLock.startDate,
        endDate: routeLock.endDate,
        isScheduled: routeLock.isScheduled
      });
    }
  }

  const allDetails = [...validDirectDetails, ...applicableObjectLocks, ...otherDetails];

  // 3. Determine overall client lock and schedule status
  const activeDetails = allDetails.filter((d) => computeLockTimingState(d, now).isBlocked);
  const scheduledDetails = allDetails.filter((d) => computeLockTimingState(d, now).isScheduled);

  const isBlocked = activeDetails.length > 0;
  const isScheduled = scheduledDetails.length > 0;

  let effectiveReason = '';
  if (isBlocked) {
    const directActive = activeDetails.find((d) => d.source === 'Клієнт');
    effectiveReason = directActive ? directActive.reason : activeDetails[0].reason;
  }

  const primaryScheduled = scheduledDetails[0];

  const primaryStart = primaryScheduled?.startDate ? formatToDisplayDateTime(primaryScheduled.startDate) : undefined;
  const primaryEnd = primaryScheduled?.endDate ? formatToDisplayDateTime(primaryScheduled.endDate) : undefined;

  return {
    ...client,
    isBlocked,
    isScheduled,
    reason: effectiveReason,
    lockDetails: allDetails,
    scheduledStart: primaryStart,
    scheduledEnd: primaryEnd,
    scheduledTime: primaryStart
  };
}
