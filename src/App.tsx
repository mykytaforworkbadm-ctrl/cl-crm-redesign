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
  EntityRegistryRow
} from './types';
import { computeLockTimingState, recomputeClientLocks, formatToDisplayDateTime } from './utils/lockTiming';

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
  const [orders, setOrders] = useState<QueueOrder[]>(QUEUE_ORDERS);
  const [unlockedOrders] = useState<UnlockedQueueOrder[]>(UNLOCKED_QUEUE_ORDERS);

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

  // Auto-dismiss mass action result alert after 5 seconds
  useEffect(() => {
    if (massActionResultMessage) {
      const timer = setTimeout(() => {
        setMassActionResultMessage(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [massActionResultMessage]);

  // Refs to always access fresh state in scheduler & filter callbacks
  const objectLocksRef = React.useRef(objectLocks);
  objectLocksRef.current = objectLocks;
  const allClientsRef = React.useRef(allClients);
  allClientsRef.current = allClients;
  const filtersRef = React.useRef(filters);
  filtersRef.current = filters;

  // Recalculates locks and client statuses according to current time
  const recalculateStatusesWith = (
    locksList: ObjectLockRecord[],
    clientsList: ClientRecord[],
    now: Date = new Date()
  ) => {
    setCurrentTime(now);

    // 1. Purge expired object locks: "Запис зникає зі списку запланованих і з реєстру блокувань об'єктів"
    const validLocks = locksList.filter((l) => !computeLockTimingState(l, now).isExpired);

    // 2. Cascade and recalculate client locks from validLocks and client schedules
    const updatedAllClients = clientsList.map((c) => recomputeClientLocks(c, validLocks, now));

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
        const otherSourceLocks = (c.lockDetails || []).filter((d) => d.source !== 'Клієнт');
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

    recalculateStatusesWith(objectLocksRef.current, updatedAllClients, now);
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
      const existingIndex = objectLocksRef.current.findIndex(
        (l) => l.targetType === targetType && (l.targetCode === targetCode || l.targetName === targetName)
      );
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
      nextLocks = objectLocksRef.current.filter(
        (l) => !(l.targetType === targetType && (l.targetCode === targetCode || l.targetName === targetName))
      );
    }

    recalculateStatusesWith(nextLocks, allClientsRef.current, now);
  };

  // Navigate to Buffer page from client row or modal
  const handleDrilldownBuffer = (client: ClientRecord, showIgnoredOnly?: boolean) => {
    setDrilldownClient(client);
    setDrilldownShowIgnoredOnly(Boolean(showIgnoredOnly));
    navigateTo('buffer');
  };

  // Remove Object Lock from Objects Page
  const handleRemoveObjectLock = (lockId: string) => {
    const removedLock = objectLocks.find((l) => l.id === lockId);
    setObjectLocks((prev) => prev.filter((l) => l.id !== lockId));

    if (removedLock) {
      setClients((prev) =>
        prev.map((c) => {
          if (!c.lockDetails) return c;
          const filteredDetails = c.lockDetails.filter(
            (ld) => !(ld.source === removedLock.targetType && ld.reason === removedLock.reason)
          );
          return {
            ...c,
            isBlocked: filteredDetails.length > 0,
            lockDetails: filteredDetails,
            reason: filteredDetails.length > 0 ? filteredDetails[0].reason : ''
          };
        })
      );
    }
  };

  // Update Scheduled Lock from Objects Page (Requirement 2.8)
  const handleUpdateObjectLock = (updatedLock: ObjectLockRecord) => {
    setObjectLocks((prev) =>
      prev.map((l) => (l.id === updatedLock.id ? updatedLock : l))
    );

    // Cascade update to clients
    setClients((prev) =>
      prev.map((c) => {
        let matches = false;
        if (updatedLock.targetType === 'Об\'єднання' && (String(c.unionId) === updatedLock.targetCode || c.unionName === updatedLock.targetName)) matches = true;
        if (updatedLock.targetType === 'РСП' && (String(c.rspId) === updatedLock.targetCode || c.rspName === updatedLock.targetName)) matches = true;
        if (updatedLock.targetType === 'Склад' && (String(c.deptId) === updatedLock.targetCode || c.deptName === updatedLock.targetName)) matches = true;
        if (updatedLock.targetType === 'Маршрут' && (String(c.routeId) === updatedLock.targetCode || c.routeName === updatedLock.targetName)) matches = true;

        if (matches && c.lockDetails) {
          const updatedDetails = c.lockDetails.map((ld) => {
            if (ld.source === updatedLock.targetType) {
              return {
                ...ld,
                reason: updatedLock.reason,
                startDate: updatedLock.startDate,
                endDate: updatedLock.endDate,
                isScheduled: updatedLock.isScheduled
              };
            }
            return ld;
          });
          return {
            ...c,
            reason: updatedLock.reason,
            lockDetails: updatedDetails
          };
        }
        return c;
      })
    );
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
    conflictCount: number = 0
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
      let msg = `Заблоковано ${lockedCount} об'єктів`;
      if (conflictCount > 0) {
        msg += `, ${conflictCount} пропущено через наявні блокування`;
      }
      setMassActionResultMessage(msg);
    } else {
      // Unlocking: determine how many actually had active locks
      let activeUnlockedCount = 0;
      let notLockedCount = 0;

      if (entityType === 'clients') {
        selectedIds.forEach((id) => {
          const c = allClientsRef.current.find((item) => item.id === Number(id));
          if (c && (c.isBlocked || c.isScheduled)) {
            activeUnlockedCount++;
          } else {
            notLockedCount++;
          }
        });
      } else {
        const targetType = entityType === 'routes' ? 'Маршрут' : entityType === 'rsps' ? 'РСП' : 'Склад';
        selectedIds.forEach((id) => {
          const l = objectLocksRef.current.find((item) => item.targetType === targetType && item.targetCode === String(id));
          if (l) {
            activeUnlockedCount++;
          } else {
            notLockedCount++;
          }
        });
      }

      let msg = `Розблоковано ${activeUnlockedCount} об'єктів`;
      if (notLockedCount > 0) {
        msg += `, ще ${notLockedCount} не мали активного блокування`;
      }
      setMassActionResultMessage(msg);
    }

    if (entityType === 'clients') {
      const idSet = new Set(selectedIds.map(Number));

      const updatedAllClients = allClientsRef.current.map((c) => {
        if (idSet.has(c.id)) {
          const otherSourceLocks = (c.lockDetails || []).filter((d) => d.source !== 'Клієнт');
          const newLockDetails = isLocking
            ? [
                {
                  source: 'Клієнт' as const,
                  reason: reason || 'Блокування НКЦ',
                  isScheduled,
                  startDate: savedStartDate,
                  endDate: savedEndDate
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

      recalculateStatusesWith(objectLocksRef.current, updatedAllClients, now);
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
            isScheduled
          };
        });

        const filtered = nextLocks.filter(
          (l) => !(l.targetType === targetType && selectedIds.map(String).includes(l.targetCode))
        );
        nextLocks = [...newLocks, ...filtered];
      } else {
        // Unlock mass objects
        nextLocks = nextLocks.filter(
          (l) => !(l.targetType === targetType && selectedIds.map(String).includes(l.targetCode))
        );
      }

      recalculateStatusesWith(nextLocks, allClientsRef.current, now);
    }
  };

  // Кількість замовлень, сума, позиції, ургентаж і ігнор у реєстрі рахуються із замовлень у буфері —
  // одне джерело даних: реєстр і вікно буфера клієнта показують однакові цифри, а зміна ігнору в буфері
  // одразу видна в колонці «Ігнор».
  const clientsView: ClientRecord[] = useMemo(() => {
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
    return clients.map((c) => {
      const st = stats.get(c.clCode);
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
    });
  }, [clients, orders]);

  // Generate rows for the entity registries (Union, RSP, Warehouse, Route)
  const currentEntityRows: EntityRegistryRow[] = useMemo(() => {
    if (filters.filterBy === 'union') {
      const list = UNIONS_DATA.filter((u) => u.value > 0);
      return list
        .filter((u) => (filters.unionId > 0 ? u.value === filters.unionId : true))
        .map((u) => {
          const lock = objectLocks.find(
            (l) =>
              l.targetType === 'Об\'єднання' &&
              (l.targetCode === String(u.value) || l.targetName.toLowerCase() === u.label.toLowerCase())
          );
          const timing = lock ? computeLockTimingState(lock, currentTime) : null;
          const relatedClients = clientsView.filter(
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
            isFuture: timing ? timing.isFuture : false,
            startDate: lock?.startDate ? formatToDisplayDateTime(lock.startDate) : undefined,
            endDate: lock?.endDate ? formatToDisplayDateTime(lock.endDate) : undefined,
            editDate: lock ? lock.lockDate : '',
            editUser: lock ? lock.lockedBy : '',
            reason: lock ? lock.reason : '',
            countOrders: countOrders > 0 ? countOrders : '',
            sumOrders:
              sumOrdersVal > 0
                ? sumOrdersVal.toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00A0/g, ' ')
                : '',
            countRows: countRows > 0 ? countRows : ''
          };
        });
    }

    if (filters.filterBy === 'rsp') {
      const list = RSPS_DATA.filter((r) => r.value > 0);
      return list
        .filter((r) => (filters.rspId > 0 ? r.value === filters.rspId : true))
        .map((r) => {
          const lock = objectLocks.find(
            (l) =>
              l.targetType === 'РСП' &&
              (l.targetCode === String(r.value) || l.targetName.toLowerCase() === r.label.toLowerCase())
          );
          const timing = lock ? computeLockTimingState(lock, currentTime) : null;
          const relatedClients = clientsView.filter(
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
            isFuture: timing ? timing.isFuture : false,
            startDate: lock?.startDate ? formatToDisplayDateTime(lock.startDate) : undefined,
            endDate: lock?.endDate ? formatToDisplayDateTime(lock.endDate) : undefined,
            editDate: lock ? lock.lockDate : '',
            editUser: lock ? lock.lockedBy : '',
            reason: lock ? lock.reason : '',
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
          const lock = objectLocks.find(
            (l) =>
              l.targetType === 'Склад' &&
              (l.targetCode === String(d.value) || l.targetName.toLowerCase() === d.label.toLowerCase())
          );
          const timing = lock ? computeLockTimingState(lock, currentTime) : null;
          const relatedClients = clientsView.filter(
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
            isFuture: timing ? timing.isFuture : false,
            startDate: lock?.startDate ? formatToDisplayDateTime(lock.startDate) : undefined,
            endDate: lock?.endDate ? formatToDisplayDateTime(lock.endDate) : undefined,
            editDate: lock ? lock.lockDate : '',
            editUser: lock ? lock.lockedBy : '',
            reason: lock ? lock.reason : '',
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
          const lock = objectLocks.find(
            (l) =>
              l.targetType === 'Маршрут' &&
              (l.targetCode === String(rt.value) || l.targetName.toLowerCase() === rt.label.toLowerCase())
          );
          const timing = lock ? computeLockTimingState(lock, currentTime) : null;
          const relatedClients = clientsView.filter(
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
            isFuture: timing ? timing.isFuture : false,
            startDate: lock?.startDate ? formatToDisplayDateTime(lock.startDate) : undefined,
            endDate: lock?.endDate ? formatToDisplayDateTime(lock.endDate) : undefined,
            editDate: lock ? lock.lockDate : '',
            editUser: lock ? lock.lockedBy : '',
            reason: lock ? lock.reason : '',
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
  }, [filters.filterBy, filters.unionId, filters.rspId, filters.deptId, filters.routeId, objectLocks, clientsView, currentTime]);

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

            {/* Сповіщення про результат масової дії */}
            {massActionResultMessage && (
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
            )}

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
                - Якщо обрано «Код клієнта», «Назва клієнта» або «Корпорація» -> Показуємо таблицю клієнтів
                - Якщо обрано «Назва об'єднання», «РСП», «Склад» або «Маршрут» -> Показуємо реєстр відповідної сутності */}
            {(filters.filterBy === 'client_code' || filters.filterBy === 'client_name' || filters.filterBy === 'corp') && (
              <ClientsTable
                clients={clientsView}
                selectedClientId={selectedClient?.id || null}
                onSelectClient={(c) => setSelectedClient(c)}
                onOpenChangeLock={handleOpenChangeLock}
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
              filters.filterBy === 'rsp' ||
              filters.filterBy === 'dept' ||
              filters.filterBy === 'route') && (
              <EntityRegistryTable
                entityType={filters.filterBy}
                rows={currentEntityRows}
                onOpenChangeLock={handleOpenChangeObjectLock}
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

      {/* Модальне вікно: Зміна блокування об'єкта (Об'єднання, РСП, Склад, Маршрут) */}
      <ChangeObjectLockModal
        isOpen={isChangeObjectLockOpen}
        row={modalObjectRow}
        onClose={() => setIsChangeObjectLockOpen(false)}
        onSave={handleSaveObjectLock}
      />

      {/* Модальне вікно: Масова дія (4 вкладки сутностей, вибір, дати, блокування) */}
      <MassActionModal
        isOpen={isMassActionOpen}
        onClose={() => setIsMassActionOpen(false)}
        clients={clientsView}
        objectLocks={objectLocks}
        onApplyMassAction={handleApplyMassAction}
      />
    </div>
  );
}
