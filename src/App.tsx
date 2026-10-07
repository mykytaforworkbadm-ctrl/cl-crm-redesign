/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { FilterPanel } from './components/FilterPanel';
import { ClientsTable } from './components/ClientsTable';
import { EntityRegistryTable } from './components/EntityRegistryTable';
import { ChangeObjectLockModal } from './components/ChangeObjectLockModal';
import { QueueOrdersPage } from './components/QueueOrdersPage';
import { ObjectLocksPage } from './components/ObjectLocksPage';
import { UnlockedQueueOrdersPage } from './components/UnlockedQueueOrdersPage';
import { ClientDetailPage } from './components/ClientDetailPage';
import { MassActionModal } from './components/MassActionModal';
import {
  INITIAL_CLIENTS,
  INITIAL_OBJECT_LOCKS,
  CORPORATIONS_DATA,
  QUEUE_ORDERS,
  UNLOCKED_QUEUE_ORDERS,
  UNIONS_DATA,
  DEPTS_DATA,
  RSPS_DATA,
  ROUTES_DATA
} from './data/mockData';
import {
  ClientRecord,
  FilterState,
  ColumnFilters,
  AppPage,
  ObjectLockRecord,
  QueueOrder,
  UnlockedQueueOrder,
  EntityType,
  EntityRegistryRow,
  HistoryEntry,
  ObjectGroup
} from './types';
import { HistoryModal } from './components/HistoryModal';
import { buildHistorySeed } from './data/historySeed';
import { computeLockTimingState, recomputeClientLocks, formatToDisplayDateTime, pickPrimaryLock, pickFutureLock, parseDateStringToMs, overlapMessage } from './utils/lockTiming';

export default function App() {
  const [currentLang, setCurrentLang] = useState<'UA' | 'RU'>('UA');
  
  // Page state with hash initialization
  const getPageFromHash = (): AppPage => {
    const hash = window.location.hash.toLowerCase();
    if (hash.includes('buffer')) return 'buffer';
    if (hash.includes('object')) return 'objects';
    if (hash.includes('unlocked')) return 'unlocked-queue';
    if (hash.includes('client/')) return 'client';
    return 'registry';
  };

  const [currentPage, setCurrentPage] = useState<AppPage>(getPageFromHash);

  // Core records
  const [allClients, setAllClients] = useState<ClientRecord[]>(INITIAL_CLIENTS);
  const [clients, setClients] = useState<ClientRecord[]>(INITIAL_CLIENTS);
  const [objectLocks, setObjectLocks] = useState<ObjectLockRecord[]>(INITIAL_OBJECT_LOCKS);
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());
  // Р4: історія блокувань по рядках (ключ: client:<id> або obj:<тип>:<код>)
  // Р4: вікно «Історія» одразу містить приклади (тестові дані, src/data/historySeed.ts)
  const [history, setHistory] = useState<Record<string, HistoryEntry[]>>(() => buildHistorySeed(INITIAL_CLIENTS, INITIAL_OBJECT_LOCKS));
  const [historyTarget, setHistoryTarget] = useState<{ key: string; title: string } | null>(null);
  // Р1: групи об'єктів (створюються імпортом файлу у «Масова дія»)
  const [groups, setGroups] = useState<ObjectGroup[]>([]);
  const [orders, setOrders] = useState<QueueOrder[]>(QUEUE_ORDERS);
  const [unlockedOrders, setUnlockedOrders] = useState<UnlockedQueueOrder[]>(UNLOCKED_QUEUE_ORDERS);

  // Selected client & drilldown states
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(INITIAL_CLIENTS[1] || null);
  const [drilldownClient, setDrilldownClient] = useState<ClientRecord | null>(null);
  const [drilldownShowIgnoredOnly, setDrilldownShowIgnoredOnly] = useState<boolean>(false);
  const [modalClient, setModalClient] = useState<ClientRecord | null>(null);
  const [returnClientContext, setReturnClientContext] = useState<ClientRecord | null>(null);
  const [objectLocksFilterPreset, setObjectLocksFilterPreset] = useState<{ type?: string; name?: string } | null>(null);

  // Registry table controlled state (preserved when navigating back)
  const [tablePage, setTablePage] = useState<number>(1);
  const [tablePageSize, setTablePageSize] = useState<number>(10);
  const [tableSortField, setTableSortField] = useState<keyof ClientRecord | null>('clName');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('asc');

  // Sync hash changes
  React.useEffect(() => {
    const handleHashChange = () => {
      const page = getPageFromHash();
      setCurrentPage(page);
      if (page === 'client') {
        const hash = window.location.hash.toLowerCase();
        const parts = hash.split('client/');
        if (parts.length > 1) {
          const rawCode = parts[1].split('/')[0].split('?')[0].trim();
          if (rawCode) {
            const found = clients.find(
              (c) => c.clCode.toLowerCase() === rawCode.toLowerCase() || String(c.id) === rawCode
            );
            if (found) {
              setSelectedClient(found);
              setModalClient(found);
            }
          }
        }
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [clients]);

  // Initial client hash resolution
  React.useEffect(() => {
    const hash = window.location.hash.toLowerCase();
    if (hash.includes('client/')) {
      const parts = hash.split('client/');
      if (parts.length > 1) {
        const rawCode = parts[1].split('/')[0].split('?')[0].trim();
        if (rawCode) {
          const found = clients.find(
            (c) => c.clCode.toLowerCase() === rawCode.toLowerCase() || String(c.id) === rawCode
          );
          if (found) {
            setSelectedClient(found);
            setModalClient(found);
          }
        }
      }
    }
  }, [clients]);

  const navigateTo = (page: AppPage, clientToNav?: ClientRecord | null, keepContext: boolean = false) => {
    if (!keepContext) {
      setReturnClientContext(null);
      setObjectLocksFilterPreset(null);
    }
    if (page === 'registry') window.location.hash = '/auto-processing/client-locks';
    else if (page === 'buffer') window.location.hash = '/auto-processing/buffer-queue';
    else if (page === 'objects') window.location.hash = '/auto-processing/object-locks';
    else if (page === 'unlocked-queue') window.location.hash = '/auto-processing/unlocked-queue';
    else if (page === 'client') {
      const targetCl = clientToNav || modalClient || selectedClient;
      window.location.hash = `/auto-processing/client/${targetCl?.clCode || targetCl?.id || ''}`;
    }
    
    if (page !== 'buffer') {
      setDrilldownClient(null);
    }
    setCurrentPage(page);
  };

  const handleNavigateToObjectLocksFromClient = (targetType?: string, targetName?: string) => {
    const activeClient = modalClient || selectedClient;
    if (activeClient) {
      setReturnClientContext(activeClient);
    }
    if (targetType || targetName) {
      setObjectLocksFilterPreset({ type: targetType, name: targetName });
    } else {
      setObjectLocksFilterPreset(null);
    }
    navigateTo('objects', null, true);
  };

  // Main filter panel state with 7 radio choices, defaulting to 'client_code'
  const [filters, setFilters] = useState<FilterState>({
    filterBy: 'client_code',
    clientCode: '',
    clientName: '',
    unionId: 0,
    corpCode: '',
    deptId: 0,
    rspId: 0,
    routeId: 0,
    showOnlyLocked: false
  });

  // Inline column filters for clients registry table
  const [columnFilters, setColumnFilters] = useState<ColumnFilters>({
    type: '',
    block: '',
    clCode: '',
    clName: '',
    corpCode: '',
    corpName: '',
    unionName: '',
    mngName: '',
    editDate: '',
    editUser: '',
    reason: '',
    countUrgent: '',
    countOrders: '',
    sumAllOrders: '',
    countRowsAllOrders: '',
    countIgnored: ''
  });

  // Modals state
  const [isChangeObjectLockOpen, setIsChangeObjectLockOpen] = useState<boolean>(false);
  const [modalObjectRow, setModalObjectRow] = useState<EntityRegistryRow | null>(null);

  const [isMassActionOpen, setIsMassActionOpen] = useState<boolean>(false);
  const [massActionResultMessage, setMassActionResultMessage] = useState<string | null>(null);

  // Повідомлення про результат масової дії лишається до закриття (×) або наступної дії — як повідомлення імпорту (К 05.10)

  // Refs to always access fresh state in scheduler & filter callbacks
  const objectLocksRef = React.useRef(objectLocks);
  objectLocksRef.current = objectLocks;
  const allClientsRef = React.useRef(allClients);
  allClientsRef.current = allClients;
  const filtersRef = React.useRef(filters);
  filtersRef.current = filters;
  const ordersRef = React.useRef(orders);
  ordersRef.current = orders;

  // П.7: реєстр «Замовлення у черзі (розблокування)» наповнюється з дій у прототипі.
  // Стан фактичного блокування кожного клієнта після попереднього перерахунку — щоб побачити момент зняття блоку.
  type BlockSnap = { blocked: boolean; reason: string; target: string; lockDate: string; lockUser: string };
  const blockStateRef = React.useRef<Map<number, BlockSnap> | null>(null);
  const liveSeqRef = React.useRef(9900000); // id записів, створених у прототипі (вище за id тестових записів)
  const liveIdsRef = React.useRef<Set<number>>(new Set()); // записи, створені в прототипі: тільки їх рухає планувальник
  const liveByOrderRef = React.useRef<Map<number, number>>(new Map()); // id замовлення в буфері → id запису реєстру
  const liveOrderOfRef = React.useRef<Map<number, number>>(new Map()); // id запису реєстру → id замовлення буфера
  const unlockedOrdersRef = React.useRef(unlockedOrders);
  unlockedOrdersRef.current = unlockedOrders;

  const fmtStamp = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  // Порівнює фактичне блокування клієнтів до і після перерахунку (Н1.4, п. 7 погодження).
  // Клієнт був заблокований і став незаблокованим → його замовлення з буфера потрапляють у реєстр розблокування:
  // неігноровані — «В очікуванні опрацювання» (чекають наступного запуску джоби перезапуску, поки що в буфері),
  // ігноровані — «Ігноровано» (залишаються в буфері, в повторну автообробку не передаються).
  // Клієнта знову заблоковано до запуску джоби → його записи «В очікуванні опрацювання» стають «Заблоковано».
  const trackUnlocks = (
    updatedClients: ClientRecord[],
    locks: ObjectLockRecord[],
    now: Date,
    actor: 'Обновление' | 'Планувальник'
  ) => {
    const prev = blockStateRef.current;
    const next = new Map<number, BlockSnap>();
    const created: UnlockedQueueOrder[] = [];
    const refreshed = new Map<number, Partial<UnlockedQueueOrder>>();
    const reblocked = new Set<number>(); // id записів реєстру
    const stamp = fmtStamp(now);
    const unlockUser = actor === 'Планувальник' ? 'Планувальник' : 'Дубінін Микита Валерійович';
    const WAIT_COMMENT = 'Блокування знято, замовлення в буфері очікує наступного запуску джоби перезапуску.';
    const IGNORED_COMMENT = 'Замовлення позначене як ігнороване, залишається в буфері і в повторну автообробку не передається.';

    updatedClients.forEach((c) => {
      const was = prev?.get(c.id);
      const clientOrders = () => ordersRef.current.filter((o) => o.clientCode === c.clCode);
      const active = (c.lockDetails || []).filter((d) => computeLockTimingState(d, now).isBlocked);
      if (active.length) {
        const primary = active.find((d) => d.source === 'Клієнт') || active[0];
        let lockDate = c.editDate || '';
        let lockUser = c.editUser || '';
        if (primary.source !== 'Клієнт') {
          const objLock = locks.find(
            (l) =>
              l.targetType === primary.source &&
              l.reason === primary.reason &&
              l.startDate === primary.startDate &&
              l.endDate === primary.endDate
          );
          if (objLock) {
            lockDate = objLock.lockDate || lockDate;
            lockUser = objLock.lockedBy || lockUser;
          }
        }
        next.set(c.id, {
          blocked: true,
          reason: primary.reason,
          target: primary.groupName ? `${primary.source} · група «${primary.groupName}»` : primary.source,
          lockDate,
          lockUser
        });
        if (was && !was.blocked) {
          clientOrders().forEach((o) => {
            const entryId = liveByOrderRef.current.get(o.id);
            if (entryId !== undefined) reblocked.add(entryId);
          });
        }
        return;
      }
      next.set(c.id, { blocked: false, reason: '', target: '', lockDate: '', lockUser: '' });
      if (!was || !was.blocked) return;

      clientOrders().forEach((o) => {
        const ignored = o.pending === 'Так';
        const fields = {
          lockDate: was.lockDate,
          lockUser: was.lockUser,
          lockReason: was.reason,
          lockTarget: was.target,
          unlockDate: stamp,
          unlockUser,
          ignored: ignored ? 'Так' : 'Ні',
          processingStatus: (ignored ? 'Ігноровано' : 'В очікуванні опрацювання') as UnlockedQueueOrder['processingStatus'],
          statusComment: ignored ? IGNORED_COMMENT : WAIT_COMMENT
        };
        const existingId = liveByOrderRef.current.get(o.id);
        if (existingId !== undefined) {
          // замовлення ще в буфері і вже має запис (повторне зняття блоку) — оновлюємо запис, а не дублюємо
          refreshed.set(existingId, fields);
          return;
        }
        liveSeqRef.current += 1;
        const id = liveSeqRef.current;
        liveIdsRef.current.add(id);
        liveByOrderRef.current.set(o.id, id);
        liveOrderOfRef.current.set(id, o.id);
        created.push({
          id,
          dateReceived: o.dateReceived,
          clientCode: o.clientCode,
          clientName: o.clientName,
          routeName: o.routeName,
          subCode: o.subCode,
          subName: o.subName,
          managerName: o.managerName,
          clOrderNo: o.clOrderNo,
          urgentazh: o.urgentazh,
          mzkOrderNo: '',
          integrationError: '—',
          ...fields
        });
      });
    });

    blockStateRef.current = next;
    if (!prev) return; // перший розрахунок після завантаження — тільки запам'ятовуємо стан

    if (created.length || refreshed.size || reblocked.size) {
      setUnlockedOrders((list) => [
        ...created,
        ...list.map((r) => {
          if (refreshed.has(r.id)) return { ...r, ...refreshed.get(r.id) };
          if (reblocked.has(r.id) && r.processingStatus === 'В очікуванні опрацювання') {
            return { ...r, processingStatus: 'Заблоковано', statusComment: 'Клієнта знову заблоковано до запуску джоби перезапуску, замовлення залишається в буфері.' };
          }
          return r;
        })
      ]);
    }
  };

  // Імітація джоби перезапуску на щохвилинній перевірці (у реальній системі — наявна джоба, до 6 хвилин, Н1.4):
  // записи, створені в прототипі, «В очікуванні опрацювання» → «В процесі опрацювання» (замовлення виходить з буфера)
  // → «Опрацьовано» на наступній перевірці. Тестові записи реєстру не змінюються.
  const advanceUnlockedQueue = () => {
    if (!liveIdsRef.current.size) return;
    const current = unlockedOrdersRef.current;
    const toProcess = current.filter((r) => liveIdsRef.current.has(r.id) && r.processingStatus === 'В очікуванні опрацювання');
    const toFinish = new Set(
      current.filter((r) => liveIdsRef.current.has(r.id) && r.processingStatus === 'В процесі опрацювання').map((r) => r.id)
    );
    if (!toProcess.length && !toFinish.size) return;
    const startIds = new Set(toProcess.map((r) => r.id));
    const next = current.map((r) => {
      if (startIds.has(r.id)) {
        return { ...r, processingStatus: 'В процесі опрацювання' as const, statusComment: 'Замовлення вийшло з буфера, триває повторна автообробка.' };
      }
      if (toFinish.has(r.id)) {
        return { ...r, processingStatus: 'Опрацьовано' as const, mzkOrderNo: `MZK-${r.id}`, statusComment: 'Повторна автообробка завершена.' };
      }
      return r;
    });
    unlockedOrdersRef.current = next;
    setUnlockedOrders(next);
    if (startIds.size) {
      const leaving = new Set<number>();
      startIds.forEach((id) => {
        const orderId = liveOrderOfRef.current.get(id);
        if (orderId !== undefined) {
          leaving.add(orderId);
          liveByOrderRef.current.delete(orderId); // замовлення більше не в буфері
        }
      });
      const remaining = ordersRef.current.filter((o) => !leaving.has(o.id));
      ordersRef.current = remaining;
      setOrders(remaining);
    }
  };

  // Recalculates locks and client statuses according to current time
  // Р4: знімок стану власних блокувань (клієнт — власне блокування, об'єкт — його блокування) для запису історії
  type LockSnap = { value: '0' | '1'; reason: string; from: string; to: string; edit: string };
  const prevSnapshotRef = React.useRef<Map<string, LockSnap> | null>(null);
  const historyRef = React.useRef(history);
  historyRef.current = history;

  const buildSnapshot = (locks: ObjectLockRecord[], clientsList: ClientRecord[], now: Date) => {
    const snap = new Map<string, LockSnap>();
    clientsList.forEach((c) => {
      const own = pickPrimaryLock((c.lockDetails || []).filter((d) => d.source === 'Клієнт'), now);
      snap.set(`client:${c.id}`, {
        value: own && computeLockTimingState(own, now).isBlocked ? '1' : '0',
        reason: own ? own.reason : '',
        from: own?.startDate ? formatToDisplayDateTime(own.startDate) : '',
        to: own?.endDate ? formatToDisplayDateTime(own.endDate) : '',
        edit: c.editDate ? c.editDate.split(' ')[0] : ''
      });
    });
    // кілька записів на об'єкт (періоди не перетинаються) — в історії рядка стан основного: діючого або найближчого
    const byKey = new Map<string, ObjectLockRecord[]>();
    locks.forEach((l) => {
      const k = `obj:${l.targetType}:${l.targetCode}`;
      byKey.set(k, [...(byKey.get(k) || []), l]);
    });
    byKey.forEach((list, k) => {
      const l = pickPrimaryLock<ObjectLockRecord>(list, now) || list[0];
      snap.set(k, {
        value: computeLockTimingState(l, now).isBlocked ? '1' : '0',
        reason: l.reason,
        from: l.startDate ? formatToDisplayDateTime(l.startDate) : '',
        to: l.endDate ? formatToDisplayDateTime(l.endDate) : '',
        edit: l.lockDate ? l.lockDate.split(' ')[0] : ''
      });
    });
    return snap;
  };

  const logHistoryDiff = (next: Map<string, LockSnap>, now: Date, actor: string) => {
    const prev = prevSnapshotRef.current;
    prevSnapshotRef.current = next;
    if (!prev) return; // перший розрахунок після завантаження — без записів
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}, ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const empty: LockSnap = { value: '0', reason: '', from: '', to: '', edit: '' };
    const added: Record<string, HistoryEntry[]> = {};
    const keys = new Set([...prev.keys(), ...next.keys()]);
    keys.forEach((key) => {
      const a = prev.get(key) || empty;
      const b = next.get(key) || empty;
      const exists = next.has(key) && (b.reason !== '' || b.value === '1');
      const rows: HistoryEntry[] = [];
      if (exists && a.reason !== b.reason) rows.push({ action: 'Обновление', date: stamp, field: 'BLOCKING_REASON', oldValue: a.reason || '—', newValue: b.reason });
      if (a.edit !== b.edit && b.edit) {
        // попередня дата змін — з останнього запису історії, якщо блокування на рядку зараз немає
        const lastEdit = [...(historyRef.current[key] || [])].reverse().find((r) => r.field === 'EDIT_DATE')?.newValue;
        rows.push({ action: 'Обновление', date: stamp, field: 'EDIT_DATE', oldValue: a.edit || lastEdit || '—', newValue: b.edit });
      }
      if (a.value !== b.value) rows.push({ action: actor, date: stamp, field: 'VALUE', oldValue: a.value, newValue: b.value });
      // блокування зникло (знято користувачем або завершився період) — період очищається тією ж дією
      const periodActor = exists ? 'Обновление' : actor;
      if ((exists || a.from) && a.from !== b.from) rows.push({ action: periodActor, date: stamp, field: 'BLOCK_DATE_FROM', oldValue: a.from || '—', newValue: b.from || '—' });
      if ((exists || a.to) && a.to !== b.to) rows.push({ action: periodActor, date: stamp, field: 'BLOCK_DATE_TO', oldValue: a.to || '—', newValue: b.to || '—' });
      if (rows.length) added[key] = rows;
    });
    if (Object.keys(added).length) {
      setHistory((h) => {
        const copy = { ...h };
        Object.entries(added).forEach(([k, rows]) => {
          copy[k] = [...(copy[k] || []), ...rows];
        });
        return copy;
      });
    }
  };

  // actor: «Обновление» — зміна користувачем; «Планувальник» — перерахунок за часом (імітація джоби розкладу)
  const recalculateStatusesWith = (
    locksList: ObjectLockRecord[],
    clientsList: ClientRecord[],
    now: Date = new Date(),
    actor: 'Обновление' | 'Планувальник' = 'Планувальник'
  ) => {
    setCurrentTime(now);

    // Перехід за часом, що настав до дії користувача (між щохвилинними перевірками), фіксується як «Планувальник»,
    // а не приписується користувачу: спершу прогін за часом по стану до дії, потім — сама дія
    if (actor === 'Обновление' && prevSnapshotRef.current) {
      const pl = objectLocksRef.current.filter((l) => !computeLockTimingState(l, now).isExpired);
      const pc = allClientsRef.current.map((c) => recomputeClientLocks(c, pl, now));
      logHistoryDiff(buildSnapshot(pl, pc, now), now, 'Планувальник');
      trackUnlocks(pc, pl, now, 'Планувальник');
    }

    // 1. Purge expired object locks: "Запис зникає зі списку запланованих і з реєстру блокувань об'єктів"
    const validLocks = locksList.filter((l) => !computeLockTimingState(l, now).isExpired);

    // 2. Cascade and recalculate client locks from validLocks and client schedules
    const updatedAllClients = clientsList.map((c) => recomputeClientLocks(c, validLocks, now));

    // Р4: запис змін у історію рядків
    logHistoryDiff(buildSnapshot(validLocks, updatedAllClients, now), now, actor);
    // П.7: зняті блокування → замовлення клієнта в реєстр «Замовлення у черзі (розблокування)»
    trackUnlocks(updatedAllClients, validLocks, now, actor);
    // Актуальні дані одразу доступні наступній дії в тому ж кліку (напр. зміна складу групи: додати + прибрати)
    objectLocksRef.current = validLocks;
    allClientsRef.current = updatedAllClients;

    setObjectLocks(validLocks);
    setAllClients(updatedAllClients);

    // Apply current search filter
    const curFilters = filtersRef.current;
    let filtered = [...updatedAllClients];
    if (curFilters.filterBy === 'client_code' && curFilters.clientCode.trim()) {
      const q = curFilters.clientCode.trim().toLowerCase();
      filtered = filtered.filter((c) => c.clCode.toLowerCase().includes(q));
    } else if (curFilters.filterBy === 'client_name' && curFilters.clientName.trim()) {
      const q = curFilters.clientName.trim().toLowerCase();
      filtered = filtered.filter((c) => c.clName.toLowerCase().includes(q));
    } else if (curFilters.filterBy === 'corp' && curFilters.corpCode && curFilters.corpCode !== '' && curFilters.corpCode !== 'all') {
      filtered = filtered.filter(
        (c) =>
          c.corpCode === curFilters.corpCode ||
          c.corpName === curFilters.corpCode ||
          (c.corpName && c.corpName.includes(curFilters.corpCode))
      );
    }
    setClients(filtered);

    // Sync selectedClient & modalClient
    setSelectedClient((prev) => {
      if (!prev) return null;
      return updatedAllClients.find((c) => c.id === prev.id) || prev;
    });
    setModalClient((prev) => {
      if (!prev) return null;
      return updatedAllClients.find((c) => c.id === prev.id) || prev;
    });
  };

  const recalculateAllStatuses = (now: Date = new Date()) => {
    recalculateStatusesWith(objectLocksRef.current, allClientsRef.current, now);
  };

  // Scheduler imitation: recalculate on mount and every minute
  useEffect(() => {
    const now = new Date();
    recalculateStatusesWith(INITIAL_OBJECT_LOCKS, INITIAL_CLIENTS, now);

    const timer = setInterval(() => {
      advanceUnlockedQueue(); // спершу рухаємо вже наявні записи, нові (з цього ж перерахунку) — з наступної перевірки
      recalculateAllStatuses();
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  // Core filter application logic for clients
  const applyFilterLogic = (currentFilters: FilterState) => {
    let result = [...allClientsRef.current];

    if (currentFilters.filterBy === 'client_code' && currentFilters.clientCode.trim()) {
      const q = currentFilters.clientCode.trim().toLowerCase();
      result = result.filter((c) => c.clCode.toLowerCase().includes(q));
    }
    if (currentFilters.filterBy === 'client_name' && currentFilters.clientName.trim()) {
      const q = currentFilters.clientName.trim().toLowerCase();
      result = result.filter((c) => c.clName.toLowerCase().includes(q));
    }
    if (currentFilters.filterBy === 'corp' && currentFilters.corpCode && currentFilters.corpCode !== '' && currentFilters.corpCode !== 'all') {
      result = result.filter(
        (c) =>
          c.corpCode === currentFilters.corpCode ||
          c.corpName === currentFilters.corpCode ||
          (c.corpName && c.corpName.includes(currentFilters.corpCode))
      );
    }

    setClients(result);
  };

  const handleFilterChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    if (newFilters.filterBy === 'corp') {
      applyFilterLogic(newFilters);
    } else if (newFilters.filterBy === 'client_code' || newFilters.filterBy === 'client_name') {
      if (newFilters.filterBy !== filters.filterBy) {
        applyFilterLogic(newFilters);
      }
    }
  };

  // Handle Main Filter Apply: recalculate on filter apply
  const handleApplyFilter = () => {
    const now = new Date();
    recalculateStatusesWith(objectLocksRef.current, allClientsRef.current, now);
  };

  // Handle Filter Reset
  const handleResetFilters = () => {
    const resetState: FilterState = {
      filterBy: filters.filterBy,
      clientCode: '',
      clientName: '',
      unionId: 0,
      corpCode: '',
      deptId: 0,
      rspId: 0,
      routeId: 0,
      showOnlyLocked: false,
      showScheduledLocks: false,
      showIgnoredOrders: false
    };
    setFilters(resetState);
    setClients(allClientsRef.current);
  };

  const handleToggleLocked = () => {
    const nextLocked = !filters.showOnlyLocked;
    const updated = {
      ...filters,
      showOnlyLocked: nextLocked,
      // Ф2 п.3: «тільки заблокованих» і «заплановані» взаємовиключні
      ...(nextLocked ? { showIgnoredOrders: false, showScheduledLocks: false } : {})
    };
    setFilters(updated);
  };

  // Р2: відкриває вікно «Зміна блокування автоімпорту клієнта» поверх реєстру (адреса #/client/<код> зберігається)
  const handleOpenChangeLock = (client: ClientRecord) => {
    setSelectedClient(client);
    setModalClient(client);
    navigateTo('client', client);
  };

  // Open "Зміна блокування" Modal for object (Union, RSP, Warehouse, Route)
  const handleOpenChangeObjectLock = (row: EntityRegistryRow) => {
    setModalObjectRow(row);
    setIsChangeObjectLockOpen(true);
  };

  // Save single client lock change
  const handleSaveLock = (
    clientId: number,
    isBlocked: boolean,
    reason: string,
    startDateTime?: string,
    endDateTime?: string
  ) => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const formattedDate = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const isScheduled = isBlocked && Boolean(startDateTime || endDateTime);

    const savedStartDate = formatToDisplayDateTime(startDateTime) || undefined;
    const savedEndDate = formatToDisplayDateTime(endDateTime) || undefined;

    const updatedAllClients = allClientsRef.current.map((c) => {
      if (c.id === clientId) {
        // вікно редагує основне власне блокування клієнта (діюче, інакше найближче заплановане);
        // інші власні записи без перетину періодів (напр. заплановане блокування групи) лишаються
        const primaryOwn = pickPrimaryLock((c.lockDetails || []).filter((d) => d.source === 'Клієнт'), now);
        const otherSourceLocks = (c.lockDetails || []).filter(
          (d) => d !== primaryOwn && !(d.source === 'Клієнт' && computeLockTimingState(d, now).isExpired)
        );
        const clientLockDetail = isBlocked
          ? [
              {
                source: 'Клієнт' as const,
                reason: reason || 'Кредитний ліміт',
                isScheduled,
                startDate: savedStartDate,
                endDate: savedEndDate
              }
            ]
          : [];
        return {
          ...c,
          lockDetails: [...clientLockDetail, ...otherSourceLocks],
          editDate: formattedDate,
          editUser: 'Дубінін Микита Валерійович'
        };
      }
      return c;
    });

    recalculateStatusesWith(objectLocksRef.current, updatedAllClients, now, 'Обновление');
  };

  // Save single object lock change (Union, RSP, Warehouse, Route)
  const handleSaveObjectLock = (
    targetType: EntityType,
    targetCode: string,
    targetName: string,
    isBlocked: boolean,
    reason: string,
    startDate?: string,
    endDate?: string
  ) => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const formattedDate = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    
    const savedStartDate = formatToDisplayDateTime(startDate) || undefined;
    const savedEndDate = formatToDisplayDateTime(endDate) || undefined;
    const isScheduled = isBlocked && Boolean(savedStartDate || savedEndDate);

    let nextLocks: ObjectLockRecord[];
    if (isBlocked) {
      // вікно редагує основний запис об'єкта (той, що показано в рядку реєстру)
      const primary = pickPrimaryLock<ObjectLockRecord>(
        objectLocksRef.current.filter((l) => l.targetType === targetType && (l.targetCode === targetCode || l.targetName === targetName)),
        now
      );
      const existingIndex = primary ? objectLocksRef.current.indexOf(primary) : -1;
      if (existingIndex >= 0) {
        nextLocks = [...objectLocksRef.current];
        nextLocks[existingIndex] = {
          ...nextLocks[existingIndex],
          reason: reason || 'Блокування НКЦ',
          lockDate: formattedDate,
          lockedBy: 'Дубінін Микита Валерійович',
          startDate: savedStartDate,
          endDate: savedEndDate,
          isScheduled
        };
      } else {
        const newLock: ObjectLockRecord = {
          id: `lock-${Date.now()}`,
          targetType,
          targetCode,
          targetName,
          reason: reason || 'Блокування НКЦ',
          lockDate: formattedDate,
          lockedBy: 'Дубінін Микита Валерійович',
          startDate: savedStartDate,
          endDate: savedEndDate,
          isScheduled
        };
        nextLocks = [newLock, ...objectLocksRef.current];
      }
    } else {
      // знімається основний запис (показаний у вікні); інший запис без перетину (напр. заплановане на майбутнє) лишається
      const primary = pickPrimaryLock<ObjectLockRecord>(
        objectLocksRef.current.filter((l) => l.targetType === targetType && (l.targetCode === targetCode || l.targetName === targetName)),
        now
      );
      nextLocks = objectLocksRef.current.filter((l) => l !== primary);
    }

    recalculateStatusesWith(nextLocks, allClientsRef.current, now, 'Обновление');
  };

  // Navigate to Buffer page from client row or modal
  const handleDrilldownBuffer = (client: ClientRecord, showIgnoredOnly?: boolean) => {
    setDrilldownClient(client);
    setSelectedClient(client); // ТЗ 4.1: після повернення на головну рядок клієнта підсвічений
    setDrilldownShowIgnoredOnly(Boolean(showIgnoredOnly));
    navigateTo('buffer');
  };

  // Remove Object Lock from Objects Page
  // Через загальний перерахунок: каскад на клієнтів і запис в історію (раніше змінювався тільки відфільтрований список
  // клієнтів, і наступний щохвилинний перерахунок повертав блокування назад)
  const handleRemoveObjectLock = (lockId: string) => {
    const nextLocks = objectLocksRef.current.filter((l) => l.id !== lockId);
    recalculateStatusesWith(nextLocks, allClientsRef.current, new Date(), 'Обновление');
  };

  // Update Scheduled Lock from Objects Page (Requirement 2.8)
  const handleUpdateObjectLock = (updatedLock: ObjectLockRecord) => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const normalized: ObjectLockRecord = {
      ...updatedLock,
      startDate: formatToDisplayDateTime(updatedLock.startDate) || undefined,
      endDate: formatToDisplayDateTime(updatedLock.endDate) || undefined,
      // редагування — це зміна: оновлюються «Дата змін» і «Змінив» (і запис EDIT_DATE в історії)
      lockDate: `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
      lockedBy: 'Дубінін Микита Валерійович'
    };
    const nextLocks = objectLocksRef.current.map((l) => (l.id === normalized.id ? normalized : l));
    recalculateStatusesWith(nextLocks, allClientsRef.current, now, 'Обновление');
  };

  // Mass Action Handler
  const handleApplyMassAction = (
    entityType: 'clients' | 'routes' | 'rsps' | 'depts',
    selectedIds: (number | string)[],
    action: 'lock' | 'unlock',
    reason: string,
    startDateTime?: string,
    endDateTime?: string,
    totalSelectedCount?: number,
    conflictCount: number = 0,
    groupName?: string // Р1: дія виконана над групою — блокування позначаються назвою групи
  ) => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const formattedDate = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const isLocking = action === 'lock';

    const savedStartDate = formatToDisplayDateTime(startDateTime) || undefined;
    const savedEndDate = formatToDisplayDateTime(endDateTime) || undefined;
    const isScheduled = isLocking && Boolean(savedStartDate || savedEndDate);

    if (isLocking) {
      const lockedCount = selectedIds.length;
      const startMs = savedStartDate ? parseDateStringToMs(savedStartDate) : null;
      const inFuture = startMs !== null && startMs > now.getTime();
      let msg = inFuture
        ? `Заплановано блокування ${lockedCount} об'єктів з ${savedStartDate}`
        : `Заблоковано ${lockedCount} об'єктів`;
      if (groupName) msg += ` (група «${groupName}»)`;
      if (conflictCount > 0) {
        msg += `, ${conflictCount} пропущено через наявні блокування`;
      }
      setMassActionResultMessage(msg);
    } else {
      // Розблокування: рахуємо тільки об'єкти, з яких справді знімається запис блокування
      // (для клієнта — власне блокування; у режимі групи — тільки блокування цієї групи)
      let activeUnlockedCount = 0;
      let notLockedCount = 0;

      if (entityType === 'clients') {
        selectedIds.forEach((id) => {
          const c = allClientsRef.current.find((item) => item.id === Number(id));
          const has = (c?.lockDetails || []).some(
            (d) => d.source === 'Клієнт' && (!groupName || d.groupName === groupName) && !computeLockTimingState(d, now).isExpired
          );
          if (has) activeUnlockedCount++;
          else notLockedCount++;
        });
      } else {
        const targetType = entityType === 'routes' ? 'Маршрут' : entityType === 'rsps' ? 'РСП' : 'Склад';
        selectedIds.forEach((id) => {
          const has = objectLocksRef.current.some(
            (item) => item.targetType === targetType && item.targetCode === String(id) && (!groupName || item.groupName === groupName)
          );
          if (has) activeUnlockedCount++;
          else notLockedCount++;
        });
      }

      let msg = `Розблоковано ${activeUnlockedCount} об'єктів`;
      if (groupName) msg += ` (блокування групи «${groupName}»)`;
      if (notLockedCount > 0) {
        msg += groupName
          ? `, ще ${notLockedCount} не мали блокування цієї групи`
          : `, ще ${notLockedCount} не мали власного блокування`;
      }
      setMassActionResultMessage(msg);
    }

    if (entityType === 'clients') {
      const idSet = new Set(selectedIds.map(Number));

      const updatedAllClients = allClientsRef.current.map((c) => {
        if (idSet.has(c.id)) {
          // Доповнення №1, розд. 2: «Замінити наявне блокування» немає — блокування з періодом, що перетинається,
          // відсіяні у вікні підтвердження; наявні записи без перетину лишаються. Розблокування групи знімає
          // тільки блокування цієї групи, звичайне розблокування — усі власні блокування клієнта.
          const otherSourceLocks = (c.lockDetails || []).filter((d) =>
            d.source !== 'Клієнт' ? true : isLocking ? true : groupName ? d.groupName !== groupName : false
          );
          const newLockDetails = isLocking
            ? [
                {
                  source: 'Клієнт' as const,
                  reason: reason || 'Блокування НКЦ',
                  isScheduled,
                  startDate: savedStartDate,
                  endDate: savedEndDate,
                  groupName
                },
                ...otherSourceLocks
              ]
            : otherSourceLocks;

          return {
            ...c,
            lockDetails: newLockDetails,
            editDate: formattedDate,
            editUser: 'Дубінін Микита Валерійович'
          };
        }
        return c;
      });

      recalculateStatusesWith(objectLocksRef.current, updatedAllClients, now, 'Обновление');
    } else {
      let targetType: EntityType = 'Маршрут';
      if (entityType === 'rsps') targetType = 'РСП';
      if (entityType === 'depts') targetType = 'Склад';

      let nextLocks = [...objectLocksRef.current];
      if (isLocking) {
        const newLocks: ObjectLockRecord[] = selectedIds.map((id) => {
          let name = String(id);
          if (entityType === 'routes') {
            const found = ROUTES_DATA.find((r) => r.value === Number(id));
            if (found) name = found.label;
          } else if (entityType === 'rsps') {
            const found = RSPS_DATA.find((r) => r.value === Number(id));
            if (found) name = found.label;
          } else if (entityType === 'depts') {
            const found = DEPTS_DATA.find((d) => d.value === Number(id));
            if (found) name = found.label;
          }

          return {
            id: `lock-mass-${id}-${Date.now()}`,
            targetType,
            targetCode: String(id),
            targetName: name,
            reason: reason || 'Блокування НКЦ',
            lockDate: formattedDate,
            lockedBy: 'Дубінін Микита Валерійович',
            startDate: savedStartDate,
            endDate: savedEndDate,
            isScheduled,
            groupName
          };
        });

        // наявні записи без перетину періодів лишаються (перетин відсіяно у вікні підтвердження)
        nextLocks = [...newLocks, ...nextLocks];
      } else {
        // Unlock mass objects; розблокування групи — тільки блокування цієї групи
        nextLocks = nextLocks.filter(
          (l) =>
            !(
              l.targetType === targetType &&
              selectedIds.map(String).includes(l.targetCode) &&
              (!groupName || l.groupName === groupName)
            )
        );
      }

      recalculateStatusesWith(nextLocks, allClientsRef.current, now, 'Обновление');
    }
  };

  // Кількість замовлень, сума, позиції, ургентаж і ігнор у реєстрі рахуються із замовлень у буфері —
  // одне джерело даних: реєстр і вікно буфера клієнта показують однакові цифри, а зміна ігнору в буфері
  // одразу видна в колонці «Ігнор».
  const bufferStats = useMemo(() => {
    const stats = new Map<string, { n: number; sum: number; rows: number; urgent: number; ignored: number }>();
    orders.forEach((o) => {
      const st = stats.get(o.clientCode) || { n: 0, sum: 0, rows: 0, urgent: 0, ignored: 0 };
      st.n += 1;
      st.sum += o.orderedSum || 0;
      st.rows += o.orderCountRows || 0;
      if (o.urgentazh === 'Так') st.urgent += 1;
      if (o.pending === 'Так') st.ignored += 1;
      stats.set(o.clientCode, st);
    });
    return stats;
  }, [orders]);
  const withBufferStats = (c: ClientRecord): ClientRecord => {
    const st = bufferStats.get(c.clCode);
    if (!st) {
      return { ...c, countOrders: '', sumAllOrders: '', countRowsAllOrders: '', countUrgent: '', countIgnored: '' };
    }
    return {
      ...c,
      countOrders: st.n,
      sumAllOrders: st.sum
        .toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        .replace(/\u00A0/g, ' '),
      countRowsAllOrders: st.rows,
      countUrgent: st.urgent,
      countIgnored: st.ignored
    };
  };
  // реєстр клієнтів — з урахуванням фільтра головної сторінки
  const clientsView: ClientRecord[] = useMemo(() => clients.map(withBufferStats), [clients, bufferStats]);
  // усі клієнти — для «Масова дія» і підсумків об'єктів: не залежать від фільтра головної сторінки
  const allClientsView: ClientRecord[] = useMemo(() => allClients.map(withBufferStats), [allClients, bufferStats]);

  // Generate rows for the entity registries (Union, RSP, Warehouse, Route)
  const currentEntityRows: EntityRegistryRow[] = useMemo(() => {
    if (filters.filterBy === 'union') {
      const list = UNIONS_DATA.filter((u) => u.value > 0);
      return list
        .filter((u) => (filters.unionId > 0 ? u.value === filters.unionId : true))
        .map((u) => {
          const objLocks = objectLocks.filter(
            (l) =>
              l.targetType === 'Об\'єднання' &&
              (l.targetCode === String(u.value) || l.targetName.toLowerCase() === u.label.toLowerCase())
          );
          const lock = pickPrimaryLock<ObjectLockRecord>(objLocks, currentTime);
          // запланований запис (може бути другим записом об'єкта поряд із діючим) — для режиму запланованих
          const futureLock = pickFutureLock<ObjectLockRecord>(objLocks, currentTime);
          const timing = lock ? computeLockTimingState(lock, currentTime) : null;
          const relatedClients = allClientsView.filter(
            (c) => c.unionId === u.value || c.unionName === u.label
          );
          const countOrders = relatedClients.reduce(
            (acc, c) => acc + (c.countOrders ? Number(c.countOrders) : 0),
            0
          );
          const sumOrdersVal = relatedClients.reduce((acc, c) => {
            const s = parseFloat(c.sumAllOrders.replace(/\s/g, '').replace(',', '.')) || 0;
            return acc + s;
          }, 0);
          const countRows = relatedClients.reduce(
            (acc, c) => acc + (c.countRowsAllOrders ? Number(c.countRowsAllOrders) : 0),
            0
          );

          return {
            id: `union-${u.value}`,
            type: 'Об\'єднання',
            code: String(u.value),
            name: u.label,
            isBlocked: timing ? timing.isBlocked : false,
            isScheduled: timing ? timing.isScheduled : false,
            isFuture: Boolean(futureLock),
            futureStart: futureLock?.startDate ? formatToDisplayDateTime(futureLock.startDate) : undefined,
            futureEnd: futureLock?.endDate ? formatToDisplayDateTime(futureLock.endDate) : undefined,
            futureReason: futureLock && futureLock !== lock ? futureLock.reason : undefined,
            futureGroup: futureLock && futureLock !== lock ? futureLock.groupName : undefined,
            startDate: lock?.startDate ? formatToDisplayDateTime(lock.startDate) : undefined,
            endDate: lock?.endDate ? formatToDisplayDateTime(lock.endDate) : undefined,
            editDate: lock ? lock.lockDate : '',
            editUser: lock ? lock.lockedBy : '',
            reason: lock ? lock.reason : '',
            groupName: lock?.groupName,
            countOrders: countOrders > 0 ? countOrders : '',
            sumOrders:
              sumOrdersVal > 0
                ? sumOrdersVal.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00A0/g, ' ')
                : '',
            countRows: countRows > 0 ? countRows : ''
          };
        });
    }

    // Р3: корпорації — окремий реєстр, такий самий, як для об'єднань
    if (filters.filterBy === 'corp') {
      const list = CORPORATIONS_DATA.filter((c) => c.value !== '');
      return list
        .filter((c) => (filters.corpCode && filters.corpCode !== 'all' ? c.value === filters.corpCode || c.label === filters.corpCode : true))
        .map((c) => {
          const objLocks = objectLocks.filter(
            (l) =>
              l.targetType === 'Корпорація' &&
              (l.targetCode === c.value || l.targetName.toLowerCase() === c.label.toLowerCase())
          );
          const lock = pickPrimaryLock<ObjectLockRecord>(objLocks, currentTime);
          // запланований запис (може бути другим записом об'єкта поряд із діючим) — для режиму запланованих
          const futureLock = pickFutureLock<ObjectLockRecord>(objLocks, currentTime);
          const timing = lock ? computeLockTimingState(lock, currentTime) : null;
          const relatedClients = allClientsView.filter((cl) => cl.corpCode === c.value || cl.corpName === c.label);
          const countOrders = relatedClients.reduce(
            (acc, cl) => acc + (cl.countOrders ? Number(cl.countOrders) : 0),
            0
          );
          const sumOrdersVal = relatedClients.reduce((acc, cl) => {
            const v = parseFloat(String(cl.sumAllOrders).replace(/\s/g, '').replace(',', '.')) || 0;
            return acc + v;
          }, 0);
          const countRows = relatedClients.reduce(
            (acc, cl) => acc + (cl.countRowsAllOrders ? Number(cl.countRowsAllOrders) : 0),
            0
          );

          return {
            id: `corp-${c.value}`,
            type: 'Корпорація',
            code: c.value,
            name: c.label,
            isBlocked: timing ? timing.isBlocked : false,
            isScheduled: timing ? timing.isScheduled : false,
            isFuture: Boolean(futureLock),
            futureStart: futureLock?.startDate ? formatToDisplayDateTime(futureLock.startDate) : undefined,
            futureEnd: futureLock?.endDate ? formatToDisplayDateTime(futureLock.endDate) : undefined,
            futureReason: futureLock && futureLock !== lock ? futureLock.reason : undefined,
            futureGroup: futureLock && futureLock !== lock ? futureLock.groupName : undefined,
            startDate: lock?.startDate ? formatToDisplayDateTime(lock.startDate) : undefined,
            endDate: lock?.endDate ? formatToDisplayDateTime(lock.endDate) : undefined,
            editDate: lock ? lock.lockDate : '',
            editUser: lock ? lock.lockedBy : '',
            reason: lock ? lock.reason : '',
            groupName: lock?.groupName,
            countOrders: countOrders > 0 ? countOrders : '',
            sumOrders:
              sumOrdersVal > 0
                ? sumOrdersVal.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00A0/g, ' ')
                : '',
            countRows: countRows > 0 ? countRows : ''
          } as EntityRegistryRow;
        });
    }

    if (filters.filterBy === 'rsp') {
      const list = RSPS_DATA.filter((r) => r.value > 0);
      return list
        .filter((r) => (filters.rspId > 0 ? r.value === filters.rspId : true))
        .map((r) => {
          const objLocks = objectLocks.filter(
            (l) =>
              l.targetType === 'РСП' &&
              (l.targetCode === String(r.value) || l.targetName.toLowerCase() === r.label.toLowerCase())
          );
          const lock = pickPrimaryLock<ObjectLockRecord>(objLocks, currentTime);
          // запланований запис (може бути другим записом об'єкта поряд із діючим) — для режиму запланованих
          const futureLock = pickFutureLock<ObjectLockRecord>(objLocks, currentTime);
          const timing = lock ? computeLockTimingState(lock, currentTime) : null;
          const relatedClients = allClientsView.filter(
            (c) => c.rspId === r.value || c.rspName === r.label
          );
          const countOrders = relatedClients.reduce(
            (acc, c) => acc + (c.countOrders ? Number(c.countOrders) : 0),
            0
          );
          const sumOrdersVal = relatedClients.reduce((acc, c) => {
            const s = parseFloat(c.sumAllOrders.replace(/\s/g, '').replace(',', '.')) || 0;
            return acc + s;
          }, 0);
          const countRows = relatedClients.reduce(
            (acc, c) => acc + (c.countRowsAllOrders ? Number(c.countRowsAllOrders) : 0),
            0
          );

          return {
            id: `rsp-${r.value}`,
            type: 'РСП',
            code: String(r.value),
            name: r.label,
            isBlocked: timing ? timing.isBlocked : false,
            isScheduled: timing ? timing.isScheduled : false,
            isFuture: Boolean(futureLock),
            futureStart: futureLock?.startDate ? formatToDisplayDateTime(futureLock.startDate) : undefined,
            futureEnd: futureLock?.endDate ? formatToDisplayDateTime(futureLock.endDate) : undefined,
            futureReason: futureLock && futureLock !== lock ? futureLock.reason : undefined,
            futureGroup: futureLock && futureLock !== lock ? futureLock.groupName : undefined,
            startDate: lock?.startDate ? formatToDisplayDateTime(lock.startDate) : undefined,
            endDate: lock?.endDate ? formatToDisplayDateTime(lock.endDate) : undefined,
            editDate: lock ? lock.lockDate : '',
            editUser: lock ? lock.lockedBy : '',
            reason: lock ? lock.reason : '',
            groupName: lock?.groupName,
            countOrders: countOrders > 0 ? countOrders : '',
            sumOrders:
              sumOrdersVal > 0
                ? sumOrdersVal.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00A0/g, ' ')
                : '',
            countRows: countRows > 0 ? countRows : ''
          };
        });
    }

    if (filters.filterBy === 'dept') {
      const list = DEPTS_DATA.filter((d) => d.value !== 0);
      return list
        .filter((d) => (filters.deptId !== 0 ? d.value === filters.deptId : true))
        .map((d) => {
          const objLocks = objectLocks.filter(
            (l) =>
              l.targetType === 'Склад' &&
              (l.targetCode === String(d.value) || l.targetName.toLowerCase() === d.label.toLowerCase())
          );
          const lock = pickPrimaryLock<ObjectLockRecord>(objLocks, currentTime);
          // запланований запис (може бути другим записом об'єкта поряд із діючим) — для режиму запланованих
          const futureLock = pickFutureLock<ObjectLockRecord>(objLocks, currentTime);
          const timing = lock ? computeLockTimingState(lock, currentTime) : null;
          const relatedClients = allClientsView.filter(
            (c) => c.deptId === d.value || c.deptName === d.label
          );
          const countOrders = relatedClients.reduce(
            (acc, c) => acc + (c.countOrders ? Number(c.countOrders) : 0),
            0
          );
          const sumOrdersVal = relatedClients.reduce((acc, c) => {
            const s = parseFloat(c.sumAllOrders.replace(/\s/g, '').replace(',', '.')) || 0;
            return acc + s;
          }, 0);
          const countRows = relatedClients.reduce(
            (acc, c) => acc + (c.countRowsAllOrders ? Number(c.countRowsAllOrders) : 0),
            0
          );

          return {
            id: `dept-${d.value}`,
            type: 'Склад',
            code: String(d.value),
            name: d.label,
            isBlocked: timing ? timing.isBlocked : false,
            isScheduled: timing ? timing.isScheduled : false,
            isFuture: Boolean(futureLock),
            futureStart: futureLock?.startDate ? formatToDisplayDateTime(futureLock.startDate) : undefined,
            futureEnd: futureLock?.endDate ? formatToDisplayDateTime(futureLock.endDate) : undefined,
            futureReason: futureLock && futureLock !== lock ? futureLock.reason : undefined,
            futureGroup: futureLock && futureLock !== lock ? futureLock.groupName : undefined,
            startDate: lock?.startDate ? formatToDisplayDateTime(lock.startDate) : undefined,
            endDate: lock?.endDate ? formatToDisplayDateTime(lock.endDate) : undefined,
            editDate: lock ? lock.lockDate : '',
            editUser: lock ? lock.lockedBy : '',
            reason: lock ? lock.reason : '',
            groupName: lock?.groupName,
            countOrders: countOrders > 0 ? countOrders : '',
            sumOrders:
              sumOrdersVal > 0
                ? sumOrdersVal.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00A0/g, ' ')
                : '',
            countRows: countRows > 0 ? countRows : ''
          };
        });
    }

    if (filters.filterBy === 'route') {
      const list = ROUTES_DATA.filter((rt) => rt.value > 0);
      return list
        .filter((rt) => (filters.routeId > 0 ? rt.value === filters.routeId : true))
        .map((rt) => {
          const objLocks = objectLocks.filter(
            (l) =>
              l.targetType === 'Маршрут' &&
              (l.targetCode === String(rt.value) || l.targetName.toLowerCase() === rt.label.toLowerCase())
          );
          const lock = pickPrimaryLock<ObjectLockRecord>(objLocks, currentTime);
          // запланований запис (може бути другим записом об'єкта поряд із діючим) — для режиму запланованих
          const futureLock = pickFutureLock<ObjectLockRecord>(objLocks, currentTime);
          const timing = lock ? computeLockTimingState(lock, currentTime) : null;
          const relatedClients = allClientsView.filter(
            (c) => c.routeId === rt.value || c.routeName === rt.label
          );
          const countOrders = relatedClients.reduce(
            (acc, c) => acc + (c.countOrders ? Number(c.countOrders) : 0),
            0
          );
          const sumOrdersVal = relatedClients.reduce((acc, c) => {
            const s = parseFloat(c.sumAllOrders.replace(/\s/g, '').replace(',', '.')) || 0;
            return acc + s;
          }, 0);
          const countRows = relatedClients.reduce(
            (acc, c) => acc + (c.countRowsAllOrders ? Number(c.countRowsAllOrders) : 0),
            0
          );

          return {
            id: `route-${rt.value}`,
            type: 'Маршрут',
            code: String(rt.value),
            name: rt.label,
            isBlocked: timing ? timing.isBlocked : false,
            isScheduled: timing ? timing.isScheduled : false,
            isFuture: Boolean(futureLock),
            futureStart: futureLock?.startDate ? formatToDisplayDateTime(futureLock.startDate) : undefined,
            futureEnd: futureLock?.endDate ? formatToDisplayDateTime(futureLock.endDate) : undefined,
            futureReason: futureLock && futureLock !== lock ? futureLock.reason : undefined,
            futureGroup: futureLock && futureLock !== lock ? futureLock.groupName : undefined,
            startDate: lock?.startDate ? formatToDisplayDateTime(lock.startDate) : undefined,
            endDate: lock?.endDate ? formatToDisplayDateTime(lock.endDate) : undefined,
            editDate: lock ? lock.lockDate : '',
            editUser: lock ? lock.lockedBy : '',
            reason: lock ? lock.reason : '',
            groupName: lock?.groupName,
            countOrders: countOrders > 0 ? countOrders : '',
            sumOrders:
              sumOrdersVal > 0
                ? sumOrdersVal.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00A0/g, ' ')
                : '',
            countRows: countRows > 0 ? countRows : ''
          };
        });
    }

    return [];
  }, [filters.filterBy, filters.unionId, filters.corpCode, filters.rspId, filters.deptId, filters.routeId, objectLocks, allClientsView, currentTime]);

  // Сповіщення про результат масової дії / збереження — на головній і на сторінці «Блокування об'єктів»
  const resultBanner = massActionResultMessage ? (
              <div
                className="alert alert-info alert-dismissible"
                style={{
                  marginBottom: 12,
                  padding: '10px 15px',
                  fontSize: 13,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#d9edf7',
                  borderColor: '#bce8f1',
                  color: '#31708f',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.08)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="glyphicon glyphicon-info-sign" style={{ fontSize: 16 }}></span>
                  <span>{massActionResultMessage}</span>
                </div>
                <button
                  type="button"
                  className="close"
                  style={{ fontSize: 18, color: '#31708f', opacity: 0.8, textShadow: 'none' }}
                  onClick={() => setMassActionResultMessage(null)}
                  title="Закрити сповіщення"
                >
                  ×
                </button>
              </div>
            ) : null;

  return (
    <div className="crm-app" style={{ minHeight: '100vh', backgroundColor: '#fff' }}>
      {/* 1. Автентичний навігаційний бар */}
      <Navbar
        currentLang={currentLang}
        onLanguageChange={setCurrentLang}
        currentPage={currentPage}
        onNavigate={navigateTo}
      />

      {/* 2. Основна робоча область */}
      <div className="container-fluid" style={{ padding: '8px 15px' }}>
        {/* VIEW 1: Блокування автоімпорту
            Р2: при відкритому вікні клієнта (#/client/...) реєстр лишається під вікном */}
        {(currentPage === 'registry' || currentPage === 'client') && (
          <>
            {/* Підшапка з назвою форми (оригінальний CRM заголовок) */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 0 8px 0',
                borderBottom: '1px solid #e5e5e5',
                marginBottom: 10
              }}
            >
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 'bold',
                  margin: 0,
                  color: '#333'
                }}
              >
                Сторінка блокування автообробки
              </h2>
            </div>

            {resultBanner}

            {/* Панель фільтрів із 7 радіокнопками та кнопками керування */}
            <FilterPanel
              filters={filters}
              onFilterChange={handleFilterChange}
              onApplyFilter={handleApplyFilter}
              onResetFilters={handleResetFilters}
              onToggleLocked={handleToggleLocked}
              onOpenMassAction={() => setIsMassActionOpen(true)}
            />

            {/* Динамічна таблиця:
                - Якщо обрано «Код клієнта» або «Назва клієнта» -> Показуємо таблицю клієнтів
                - Якщо обрано «Назва об'єднання», «Корпорація» (Р3), «РСП», «Склад» або «Маршрут» -> Показуємо реєстр відповідної сутності */}
            {(filters.filterBy === 'client_code' || filters.filterBy === 'client_name') && (
              <ClientsTable
                clients={clientsView}
                selectedClientId={selectedClient?.id || null}
                onSelectClient={(c) => setSelectedClient(c)}
                onOpenChangeLock={handleOpenChangeLock}
                onOpenHistory={(c) => setHistoryTarget({ key: `client:${c.id}`, title: `Клієнт ${c.clCode} · ${c.clName}` })}
                onDrilldownBuffer={handleDrilldownBuffer}
                columnFilters={columnFilters}
                onColumnFilterChange={setColumnFilters}
                showScheduledLocks={Boolean(filters.showScheduledLocks)}
                showIgnoredOrders={Boolean(filters.showIgnoredOrders)}
                showOnlyLocked={Boolean(filters.showOnlyLocked)}
                tablePage={tablePage}
                onTablePageChange={setTablePage}
                pageSize={tablePageSize}
                onPageSizeChange={setTablePageSize}
                sortField={tableSortField}
                onSortFieldChange={setTableSortField}
                sortDir={tableSortDir}
                onSortDirChange={setTableSortDir}
              />
            )}

            {(filters.filterBy === 'union' ||
              filters.filterBy === 'corp' ||
              filters.filterBy === 'rsp' ||
              filters.filterBy === 'dept' ||
              filters.filterBy === 'route') && (
              <EntityRegistryTable
                key={filters.filterBy}
                entityType={filters.filterBy}
                rows={currentEntityRows}
                onOpenChangeLock={handleOpenChangeObjectLock}
                onOpenHistory={(row) => setHistoryTarget({ key: `obj:${row.type}:${row.code}`, title: `${row.type} · ${row.name}` })}
                showOnlyLocked={filters.showOnlyLocked}
                showScheduledLocks={Boolean(filters.showScheduledLocks)}
              />
            )}
          </>
        )}

        {/* VIEW 2: Замовлення у черзі (Буфер) */}
        {currentPage === 'buffer' && (
          <QueueOrdersPage
            orders={orders}
            // зміни ігнору / видалення на сторінці буфера — у спільний буфер (колонки «Ігнор», «Кількість замовлень» у реєстрі)
            onUpdateOrders={(updated) => setOrders(updated)}
            initialClientFilter={drilldownClient}
            initialShowIgnoredOnly={drilldownShowIgnoredOnly}
            returnClient={returnClientContext}
            onClearInitialFilter={() => {
              setDrilldownClient(null);
              setDrilldownShowIgnoredOnly(false);
            }}
            onNavigateBack={() => {
              if (returnClientContext) {
                const clientToReturn = returnClientContext;
                setReturnClientContext(null);
                setSelectedClient(clientToReturn);
                setModalClient(clientToReturn);
                navigateTo('client', clientToReturn);
              } else {
                navigateTo('registry');
              }
            }}
          />
        )}

        {/* VIEW 3: Блокування об'єктів (Маршрути, РСП, Склади, Об'єднання) */}
        {currentPage === 'objects' && <div style={{ padding: '0 15px' }}>{resultBanner}</div>}
        {currentPage === 'objects' && (
          <ObjectLocksPage
            objectLocks={objectLocks}
            onRemoveLock={handleRemoveObjectLock}
            onOpenMassAction={() => setIsMassActionOpen(true)}
            onUpdateLock={handleUpdateObjectLock}
            returnClient={returnClientContext}
            initialFilterType={objectLocksFilterPreset?.type}
            initialSearchQuery={objectLocksFilterPreset?.name}
            onNavigateBack={() => {
              if (returnClientContext) {
                const clientToReturn = returnClientContext;
                setReturnClientContext(null);
                setObjectLocksFilterPreset(null);
                setSelectedClient(clientToReturn);
                setModalClient(clientToReturn);
                navigateTo('client', clientToReturn);
              } else {
                navigateTo('registry');
              }
            }}
          />
        )}

        {/* VIEW 4: Замовлення у черзі (розблокування) */}
        {currentPage === 'unlocked-queue' && (
          <UnlockedQueueOrdersPage
            orders={unlockedOrders}
            onNavigateBack={() => navigateTo('registry')}
          />
        )}

        {/* VIEW 5: Р2 — вікно «Зміна блокування автоімпорту клієнта» поверх реєстру (замість сторінки «Картка клієнта») */}
        {currentPage === 'client' && (modalClient || selectedClient) && (
          <ClientDetailPage
            client={(modalClient || selectedClient)!}
            objectLocks={objectLocks}
            allOrders={orders}
            onSaveClientLock={(clientId, isBlocked, reason, startDateTime, endDateTime) => {
              handleSaveLock(clientId, isBlocked, reason, startDateTime, endDateTime);
              const savedClient = allClientsRef.current.find((c) => c.id === clientId);
              setMassActionResultMessage(
                `Зміни блокування автоімпорту клієнта ${savedClient ? `${savedClient.clCode} · ${savedClient.clName}` : ''} збережено.`
              );
            }}
            onUpdateOrders={(updated) => setOrders(updated)}
            onNavigateBack={() => {
              setReturnClientContext(null);
              setObjectLocksFilterPreset(null);
              navigateTo('registry');
            }}
            onNavigateToObjectLocks={(entityType, entityName) => {
              handleNavigateToObjectLocksFromClient(entityType, entityName);
            }}
          />
        )}
      </div>

      {/* Р4: вікно «Історія» рядка */}
      <HistoryModal
        isOpen={Boolean(historyTarget)}
        title={historyTarget?.title || ''}
        entries={historyTarget ? history[historyTarget.key] || [] : []}
        onClose={() => setHistoryTarget(null)}
      />

      {/* Модальне вікно: Зміна блокування об'єкта (Об'єднання, РСП, Склад, Маршрут) */}
      <ChangeObjectLockModal
        isOpen={isChangeObjectLockOpen}
        row={modalObjectRow}
        onClose={() => setIsChangeObjectLockOpen(false)}
        onSave={handleSaveObjectLock}
        checkOverlap={(row, start, end) => {
          // інші записи цього об'єкта, крім того, що редагується у вікні (основного)
          const list = objectLocksRef.current.filter(
            (l) => l.targetType === row.type && (l.targetCode === String(row.code) || l.targetName === row.name)
          );
          const primary = pickPrimaryLock<ObjectLockRecord>(list, new Date());
          return overlapMessage(list.filter((l) => l !== primary), start, end);
        }}
      />

      {/* Модальне вікно: Масова дія (4 вкладки сутностей, вибір, дати, блокування) */}
      <MassActionModal
        isOpen={isMassActionOpen}
        onClose={() => setIsMassActionOpen(false)}
        clients={allClientsView}
        objectLocks={objectLocks}
        groups={groups}
        onGroupsChange={setGroups}
        onResultMessage={(m) => setMassActionResultMessage(m)}
        onApplyMassAction={handleApplyMassAction}
      />
    </div>
  );
}
