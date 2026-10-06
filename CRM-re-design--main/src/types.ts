export type ClientType = 'usual' | 'corp' | 'corp-member';

export interface LockDetail {
  source: 'Клієнт' | 'Об\'єднання' | 'РСП' | 'Маршрут' | 'Склад' | 'Корпорація';
  reason: string;
  startDate?: string;
  endDate?: string;
  isScheduled?: boolean;
}

export interface ClientRecord {
  id: number;
  clId: number;
  isCorp: number;
  corpCode: string;
  corpName: string;
  type: ClientType;
  typeLabel: string;
  isBlocked: boolean;
  isScheduled?: boolean;
  scheduledTime?: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  scheduledObject?: string;
  scheduledAction?: string;
  clCode: string;
  clName: string;
  unionName: string;
  unionId?: number;
  mngName: string;
  editDate: string;
  editUser: string;
  reason: string;
  reasonId?: number;
  lockDetails?: LockDetail[];
  countUrgent: string | number;
  countOrders: string | number;
  sumAllOrders: string;
  countRowsAllOrders: string | number;
  countIgnored: string | number;
  rspId?: number;
  rspName?: string;
  deptId?: number;
  deptName?: string;
  routeId?: number;
  routeName?: string;
}

export interface QueueOrder {
  id: number;
  dateReceived: string;
  clOrderNo: string;
  msgId: number;
  clientName: string;
  clientCode: string;
  routeName: string;
  subId: number;
  subCode: string;
  subName: string;
  fileName: string;
  managerName: string;
  orderedSum: number;
  pending: string; // 'Так' | 'Ні'
  urgentazh: string; // 'Так' | 'Ні'
  orderCountRows: number;
  unionName?: string;
  corpCode?: string;
  corpName?: string;
}

export type EntityType = 'Маршрут' | 'РСП' | 'Склад' | 'Об\'єднання';

export interface ObjectLockRecord {
  id: string;
  targetType: EntityType;
  targetCode: string;
  targetName: string;
  reason: string;
  lockDate: string;
  lockedBy: string;
  startDate?: string;
  endDate?: string;
  isScheduled?: boolean;
}

export type AppPage = 'registry' | 'buffer' | 'objects' | 'unlocked-queue' | 'client';

export type ProcessingStatus =
  | 'Заблоковано'
  | 'В очікуванні опрацювання'
  | 'В процесі опрацювання'
  | 'Опрацьовано'
  | 'Ігноровано';

export type BlockingReasonType =
  | 'Блокування НКЦ'
  | 'Частковий кредитний ліміт'
  | 'Дебіторська заборгованість'
  | 'Кредитний ліміт';

export interface UnlockedQueueOrder {
  id: number;
  dateReceived: string; // Дата надходження замовлення
  clientCode: string; // Код клієнта
  clientName: string; // Назва клієнта
  routeName: string; // Маршрут
  subCode: string; // Код підрозділу
  subName: string; // Назва підрозділу
  managerName: string; // Менеджер клієнта
  clOrderNo: string; // Номер замовлення клієнта
  lockDate: string; // Дата блокування
  lockUser: string; // Змінив (блокування)
  lockReason: BlockingReasonType | string; // Причина блокування
  lockTarget: string; // Об'єкт блокування
  unlockDate: string; // Дата розблокування
  unlockUser: string; // Змінив (розблокування)
  ignored: string; // Ігнорування
  urgentazh: string; // Ургентаж
  mzkOrderNo: string; // Номер замовлення в МЗК
  processingStatus: ProcessingStatus; // Статус опрацювання
  integrationError: string; // Помилка, що виникла в процесі інтеграції
  statusComment: string; // Коментар до статусу
}

export type FilterFieldType = 'client_code' | 'client_name' | 'union' | 'corp' | 'rsp' | 'dept' | 'route';

export interface EntityRegistryRow {
  id: string | number;
  type: EntityType;
  code: string;
  name: string;
  isBlocked: boolean;
  isScheduled?: boolean;
  isFuture?: boolean; // Ф2: є блокування з початком у майбутньому
  scheduledTime?: string;
  startDate?: string;
  endDate?: string;
  editDate: string;
  editUser: string;
  reason: string;
  countOrders: string | number;
  sumOrders: string;
  countRows: string | number;
}

export interface FilterState {
  filterBy: FilterFieldType;
  clientCode: string;
  clientName: string;
  unionId: number;
  corpCode?: string;
  deptId: number;
  rspId: number;
  routeId: number;
  showOnlyLocked: boolean;
  showScheduledLocks?: boolean;
  showIgnoredOrders?: boolean;
}

export interface ColumnFilters {
  type: string;
  block: string;
  clCode: string;
  clName: string;
  corpCode: string;
  corpName: string;
  unionName: string;
  mngName: string;
  editDate: string;
  editUser: string;
  reason: string;
  countUrgent: string;
  countOrders: string;
  sumAllOrders: string;
  countRowsAllOrders: string;
  countIgnored: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  scheduledObject?: string;
  scheduledAction?: string;
}

export interface QueueColumnFilters {
  dateReceived: string;
  clOrderNo: string;
  msgId: string;
  clientName: string;
  clientCode: string;
  routeName: string;
  subCode: string;
  subName: string;
  fileName: string;
  managerName: string;
  orderedSum: string;
  pending: string;
  urgentazh: string;
  orderCountRows: string;
  ignored?: string;
}
