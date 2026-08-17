import type { Permission, RoleCode } from '@/domains/staff/shared/permissions';

/** Client-safe представление текущего сотрудника. Без хешей и токенов. */
export type StaffPrincipal = {
  id: string;
  venueId: string;
  displayName: string;
  email: string;
  roles: RoleCode[];
  permissions: Permission[];
};
