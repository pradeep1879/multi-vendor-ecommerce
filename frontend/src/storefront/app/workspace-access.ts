import type { AuthUser } from '../features/auth/auth-state';

export type WorkspaceRole = Extract<AuthUser['role'], 'ADMIN' | 'VENDOR'>;

export function workspaceHome(role: AuthUser['role']) {
  if (role === 'ADMIN') return '/admin/dashboard';
  if (role === 'VENDOR') return '/vendor/dashboard';
  return '/account';
}

export function canAccessWorkspace(requiredRole: WorkspaceRole, userRole: AuthUser['role']) {
  return requiredRole === userRole;
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
