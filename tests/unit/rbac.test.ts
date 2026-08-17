import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  permissionsForRoles,
  roleHasPermission,
  type Permission,
  type RoleCode,
} from '@/domains/staff/shared/permissions';

/**
 * Authorization matrix tests (docs/rbac-matrix.md §4).
 * Проверяется каждая пара роль×разрешение, включая отрицательные кейсы.
 */
const EXPECTED: Record<RoleCode, Permission[]> = {
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

describe('матрица роль × разрешение', () => {
  for (const role of ROLES) {
    for (const permission of PERMISSIONS) {
      const expected = EXPECTED[role].includes(permission);
      it(`${role} ${expected ? 'имеет' : 'не имеет'} ${permission}`, () => {
        expect(roleHasPermission(role, permission)).toBe(expected);
      });
    }
  }
});

describe('явные запреты из ТЗ', () => {
  it('WAITER не управляет ролями', () => {
    expect(roleHasPermission('WAITER', 'MANAGE_ROLES')).toBe(false);
  });

  it('BARTENDER не управляет кухней, персоналом и платежами', () => {
    expect(roleHasPermission('BARTENDER', 'VIEW_KITCHEN_QUEUE')).toBe(false);
    expect(roleHasPermission('BARTENDER', 'MANAGE_STAFF')).toBe(false);
    expect(roleHasPermission('BARTENDER', 'MANAGE_INTEGRATIONS')).toBe(false);
  });

  it('CHEF не управляет платежами и персоналом', () => {
    expect(roleHasPermission('CHEF', 'VIEW_PAYMENTS')).toBe(false);
    expect(roleHasPermission('CHEF', 'MANAGE_STAFF')).toBe(false);
  });

  it('ACCOUNTANT не видит производственные очереди', () => {
    expect(roleHasPermission('ACCOUNTANT', 'VIEW_KITCHEN_QUEUE')).toBe(false);
    expect(roleHasPermission('ACCOUNTANT', 'VIEW_BAR_QUEUE')).toBe(false);
  });

  it('ADMIN не имеет доступа к финансовой истории', () => {
    expect(roleHasPermission('ADMIN', 'VIEW_PAYMENTS')).toBe(false);
    expect(roleHasPermission('ADMIN', 'EXPORT_FINANCIAL_DATA')).toBe(false);
    expect(roleHasPermission('ADMIN', 'PROCESS_REFUND')).toBe(false);
  });

  it('OWNER имеет все разрешения', () => {
    expect(ROLE_PERMISSIONS.OWNER).toHaveLength(PERMISSIONS.length);
  });
});

describe('несколько ролей у одного сотрудника', () => {
  it('разрешения объединяются', () => {
    const permissions = permissionsForRoles(['WAITER', 'BARTENDER']);
    expect(permissions.has('APPROVE_ORDER_ROUND')).toBe(true);
    expect(permissions.has('VIEW_BAR_QUEUE')).toBe(true);
    expect(permissions.has('MANAGE_ROLES')).toBe(false);
  });
});
