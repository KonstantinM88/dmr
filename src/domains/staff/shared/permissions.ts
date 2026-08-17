/**
 * Разрешения и матрица ролей (docs/rbac-matrix.md §1–2).
 * Client-safe: только константы и типы, без Prisma и секретов.
 *
 * Единственный источник истины для сида БД и для authorization-matrix тестов.
 */

export const PERMISSIONS = [
  'VIEW_ASSIGNED_TABLES',
  'MANAGE_DINING_SESSION',
  'APPROVE_ORDER_ROUND',
  'CREATE_MANUAL_ORDER',
  'MANAGE_REORDER_APPROVAL',
  'MARK_ITEM_SERVED',
  'REQUEST_PAYMENT',
  'REGISTER_CASH_PAYMENT',
  'VIEW_KITCHEN_QUEUE',
  'VIEW_BAR_QUEUE',
  'MANAGE_PRODUCTION_TICKET',
  'MANAGE_MENU',
  'MANAGE_TABLES_QR',
  'MANAGE_OPERATIONAL_SETTINGS',
  'MANAGE_STAFF',
  'VIEW_PAYMENTS',
  'VIEW_REFUNDS',
  'VIEW_TAX_REPORTS',
  'EXPORT_FINANCIAL_DATA',
  'PROCESS_REFUND',
  'MANAGE_ROLES',
  'VIEW_AUDIT_LOG',
  'MANAGE_INTEGRATIONS',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ['WAITER', 'BARTENDER', 'CHEF', 'ADMIN', 'ACCOUNTANT', 'OWNER'] as const;
export type RoleCode = (typeof ROLES)[number];

export const ROLE_LABELS: Record<RoleCode, string> = {
  WAITER: 'Service',
  BARTENDER: 'Bar',
  CHEF: 'Küche',
  ADMIN: 'Verwaltung',
  ACCOUNTANT: 'Buchhaltung',
  OWNER: 'Inhaber',
};

/**
 * MANAGE_PRODUCTION_TICKET у BARTENDER/CHEF ограничен станцией: само
 * разрешение одинаковое, доступ к конкретному тикету дополнительно
 * проверяется по VIEW_BAR_QUEUE / VIEW_KITCHEN_QUEUE в сервисе станции
 * (Этап 3). PROCESS_REFUND у ACCOUNTANT выдаётся явно и может быть отозван.
 */
export const ROLE_PERMISSIONS: Record<RoleCode, readonly Permission[]> = {
  WAITER: [
    'VIEW_ASSIGNED_TABLES',
    'MANAGE_DINING_SESSION',
    'APPROVE_ORDER_ROUND',
    'CREATE_MANUAL_ORDER',
    'MANAGE_REORDER_APPROVAL',
    'MARK_ITEM_SERVED',
    'REQUEST_PAYMENT',
    'REGISTER_CASH_PAYMENT',
  ],
  BARTENDER: ['VIEW_BAR_QUEUE', 'MANAGE_PRODUCTION_TICKET'],
  CHEF: ['VIEW_KITCHEN_QUEUE', 'MANAGE_PRODUCTION_TICKET'],
  ADMIN: ['MANAGE_MENU', 'MANAGE_TABLES_QR', 'MANAGE_OPERATIONAL_SETTINGS', 'MANAGE_STAFF'],
  ACCOUNTANT: [
    'REGISTER_CASH_PAYMENT',
    'VIEW_PAYMENTS',
    'VIEW_REFUNDS',
    'VIEW_TAX_REPORTS',
    'EXPORT_FINANCIAL_DATA',
    'PROCESS_REFUND',
  ],
  OWNER: [...PERMISSIONS],
};

export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  VIEW_ASSIGNED_TABLES: 'Назначенные столы и сессии',
  MANAGE_DINING_SESSION: 'Открытие/закрытие сессии стола',
  APPROVE_ORDER_ROUND: 'Подтверждение и отклонение раунда заказа',
  CREATE_MANUAL_ORDER: 'Ручной заказ от лица официанта',
  MANAGE_REORDER_APPROVAL: 'Смена режима подтверждения дозаказов',
  MARK_ITEM_SERVED: 'Отметка о подаче позиции',
  REQUEST_PAYMENT: 'Запрос оплаты счёта',
  REGISTER_CASH_PAYMENT: 'Регистрация наличного/терминального платежа',
  VIEW_KITCHEN_QUEUE: 'Просмотр кухонной очереди',
  VIEW_BAR_QUEUE: 'Просмотр барной очереди',
  MANAGE_PRODUCTION_TICKET: 'Управление тикетом своей станции',
  MANAGE_MENU: 'Управление меню, ценами и доступностью',
  MANAGE_TABLES_QR: 'Управление столами и QR-кодами',
  MANAGE_OPERATIONAL_SETTINGS: 'Операционные настройки заведения',
  MANAGE_STAFF: 'Управление сотрудниками',
  VIEW_PAYMENTS: 'Просмотр платежей',
  VIEW_REFUNDS: 'Просмотр возвратов',
  VIEW_TAX_REPORTS: 'Налоговые отчёты',
  EXPORT_FINANCIAL_DATA: 'Экспорт финансовых данных',
  PROCESS_REFUND: 'Выполнение возврата',
  MANAGE_ROLES: 'Назначение ролей',
  VIEW_AUDIT_LOG: 'Просмотр журнала аудита',
  MANAGE_INTEGRATIONS: 'Настройки интеграций',
};

/** Union разрешений по всем ролям сотрудника. */
export function permissionsForRoles(roles: readonly RoleCode[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) result.add(permission);
  }
  return result;
}

export function roleHasPermission(role: RoleCode, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
