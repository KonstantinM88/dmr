import 'server-only';
import { getStaffPrincipal } from '@/domains/staff/server/session.service';
import type { StaffPrincipal } from '@/domains/staff/shared/types';
import type { Permission } from '@/domains/staff/shared/permissions';

/**
 * Серверная проверка разрешений (docs/rbac-matrix.md).
 * Скрытие кнопки в UI не является защитой: каждый server action и route
 * handler вызывает requirePermission явно.
 */
export class AuthenticationRequiredError extends Error {
  constructor() {
    super('Требуется аутентификация сотрудника.');
    this.name = 'AuthenticationRequiredError';
  }
}

export class PermissionDeniedError extends Error {
  readonly permission: Permission;

  constructor(permission: Permission) {
    super(`Недостаточно прав: ${permission}`);
    this.name = 'PermissionDeniedError';
    this.permission = permission;
  }
}

export function hasPermission(principal: StaffPrincipal | null, permission: Permission): boolean {
  return principal !== null && principal.permissions.includes(permission);
}

export async function requireStaff(): Promise<StaffPrincipal> {
  const principal = await getStaffPrincipal();
  if (!principal) throw new AuthenticationRequiredError();
  return principal;
}

export async function requirePermission(permission: Permission): Promise<StaffPrincipal> {
  const principal = await requireStaff();
  if (!principal.permissions.includes(permission)) {
    throw new PermissionDeniedError(permission);
  }
  return principal;
}

export async function requireAnyPermission(
  permissions: readonly Permission[],
): Promise<StaffPrincipal> {
  const principal = await requireStaff();
  const granted = permissions.some((permission) => principal.permissions.includes(permission));
  if (!granted) throw new PermissionDeniedError(permissions[0] as Permission);
  return principal;
}
