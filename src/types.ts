export type ClientType = 'usual' | 'corp' | 'corp-member';

export interface LockDetail {
  source: 'Клієнт' | 'Об\'єднання' | 'РСП' | 'Маршрут' | 'Склад' | 'Корпорація';
  reason: string;
  startDate?: string;
  endDate?: string;
  isScheduled?: boolean;
  groupName?: string; // Р1: блокування встановлене на групу об'єктів
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

// Р3: корпорація — об'єкт блокування того самого роду, що й об'єднання («це одна сутність», коментар бізнесу 05.10)
export type EntityType = 'Маршрут' | 'РСП' | 'Склад' | 'Об\'єднання' | 'Корпорація';

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
  groupName?: string; // Р1: блокування встановлене на групу об'єктів
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
  futureStart?: string; // період найближчого запланованого запису (режим запланованих)
  futureEnd?: string;
  futureReason?: string; // причина запланованого запису, якщо він інший, ніж показаний (діючий)
  futureGroup?: string; // група запланованого запису
  scheduledTime?: string;
  startDate?: string;
  endDate?: string;
  editDate: string;
  editUser: string;
  reason: string;
  groupName?: string; // Р1: блокування встановлене на групу
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

// Р4: запис історії блокування рядка (як вікно «Історія» в поточному додатку: Дія, Дата, Поле, Старе / Нове значення)
export interface HistoryEntry {
  action: string; // «Обновление» — зміна користувачем; «Планувальник» — автоматичне вмикання / вимикання за розкладом
  date: string; // дд.мм.рррр, гг:хх:сс
  field: string; // VALUE, BLOCKING_REASON, EDIT_DATE, BLOCK_DATE_FROM, BLOCK_DATE_TO
  oldValue: string;
  newValue: string;
}

// Р1 (коментар бізнесу 05.10, п. 1.a–1.c, 2): група об'єктів одного типу — імпортований список (назва = ім'я файлу)
export type GroupKind = 'clients' | 'routes' | 'rsps' | 'depts';

export interface ObjectGroup {
  id: string;
  name: string;
  kind: GroupKind;
  memberIds: number[];
  createdAt: string; // дд.мм.рррр гг:хх
  editedAt: string;
  editedBy: string;
  lastAction?: 'lock' | 'unlock';
  reason?: string;
  lockFrom?: string; // дд.мм.рррр гг:хх — початок блокування групи (або момент негайного блокування)
  lockTo?: string;
}
