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

/**
 * Відображення запланованого (ще не діючого) блокування в колонці «Блок».
 * false (погоджено 06.10, як просить бізнес у п. 3): до початку періоду «Ні» + ⏱, «Так» — тільки в межах періоду.
 * Майбутнє блокування об'єкта показується в колонці «Причина» одразу, з ⏱ і часом початку (рішення з Линник А. Т.).
 * true — альтернатива, що обговорювалась: «Так» + ⏱ одразу після планування.
 */
export const SHOW_SCHEDULED_AS_BLOCKED = false;

/** Значення колонки «Блок»: діючий блок або (за рішенням вище) заплановане блокування. */
export const isShownAsBlocked = (isBlockedNow: boolean, hasFutureLock: boolean): boolean =>
  isBlockedNow || (SHOW_SCHEDULED_AS_BLOCKED && hasFutureLock);

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
/**
 * Основний запис блокування об'єкта серед кількох (періоди не перетинаються): діючий, інакше найближчий запланований.
 */
export function pickPrimaryLock<T extends { startDate?: string; endDate?: string; isScheduled?: boolean }>(
  locks: T[],
  now: Date = new Date()
): T | undefined {
  const live = locks.filter((l) => !computeLockTimingState(l, now).isExpired);
  const active = live.find((l) => computeLockTimingState(l, now).isBlocked);
  if (active) return active;
  const future = live
    .filter((l) => computeLockTimingState(l, now).isFuture)
    .sort((a, b) => (parseDateStringToMs(a.startDate) ?? 0) - (parseDateStringToMs(b.startDate) ?? 0));
  return future[0] || live[0];
}

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
    (d) => !['Клієнт', 'Об\'єднання', 'Корпорація', 'РСП', 'Склад', 'Маршрут'].includes(d.source)
  ).filter((d) => !computeLockTimingState(d, now).isExpired);

  // 2. Cascade from activeObjectLocks.
  // На один об'єкт може бути кілька записів з періодами, що не перетинаються (Доповнення №1, розд. 2:
  // напр. активне безстрокове і заплановане на майбутнє) — на клієнта переносяться всі.
  const applicableObjectLocks: LockDetail[] = [];
  const cascade = (
    source: LockDetail['source'],
    targetType: ObjectLockRecord['targetType'],
    code: string | undefined,
    name: string | undefined
  ) => {
    activeObjectLocks
      .filter(
        (l) =>
          l.targetType === targetType &&
          ((code && l.targetCode === code) || (name && l.targetName.toLowerCase() === name.toLowerCase()))
      )
      .filter((l) => !computeLockTimingState(l, now).isExpired)
      .forEach((l) =>
        applicableObjectLocks.push({
          source,
          reason: l.reason,
          startDate: l.startDate,
          endDate: l.endDate,
          isScheduled: l.isScheduled,
          groupName: l.groupName
        })
      );
  };
  cascade('Об\'єднання', 'Об\'єднання', client.unionId ? String(client.unionId) : undefined, client.unionName);
  // Р3: корпорація (за кодом корпорації клієнта або назвою)
  cascade('Корпорація', 'Корпорація', client.corpCode || undefined, client.corpName);
  cascade('РСП', 'РСП', client.rspId ? String(client.rspId) : undefined, client.rspName);
  cascade('Склад', 'Склад', client.deptId ? String(client.deptId) : undefined, client.deptName);
  cascade('Маршрут', 'Маршрут', client.routeId ? String(client.routeId) : undefined, client.routeName);

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
