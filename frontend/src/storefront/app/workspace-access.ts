import type { AuthRole, AuthUser } from '../features/auth/auth-state';

export type WorkspaceRole = Extract<AuthUser['role'], 'ADMIN' | 'VENDOR'>;

export function workspaceHome(role: AuthUser['role'], vendorStatus?: AuthUser['vendorStatus']) {
  return roleDestination(role, vendorStatus);
}

export function canAccessWorkspace(requiredRole: WorkspaceRole, userRoles: readonly AuthRole[]) {
  return userRoles.includes(requiredRole);
}

export function roleDestination(role: AuthRole, vendorStatus?: AuthUser['vendorStatus']) {
  if (role === 'ADMIN') return '/admin/dashboard';
  if (role === 'VENDOR')
    return vendorStatus === 'APPROVED' ? '/vendor/dashboard' : '/vendor/application-status';
  return '/';
}

export function nextVendorOrderAction(status: string) {
  const actions: Record<string, { status: string; label: string }> = {
    PLACED: { status: 'ACCEPTED', label: 'Accept order' },
    ACCEPTED: { status: 'PACKED', label: 'Mark packed' },
    PACKED: { status: 'SHIPPED', label: 'Add tracking and ship' },
    SHIPPED: { status: 'DELIVERED', label: 'Mark delivered' },
  };
  return actions[status] ?? null;
}
