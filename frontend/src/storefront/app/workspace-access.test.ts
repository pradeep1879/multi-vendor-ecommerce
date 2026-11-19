import { describe, expect, test } from 'bun:test';
import { canAccessWorkspace, nextVendorOrderAction, workspaceHome } from './workspace-access';

describe('workspace access routing', () => {
  test('routes each signed-in role to its own dashboard', () => {
    expect(workspaceHome('ADMIN')).toBe('/admin/dashboard');
    expect(workspaceHome('VENDOR', 'APPROVED')).toBe('/vendor/dashboard');
    expect(workspaceHome('CUSTOMER')).toBe('/');
  });

  test('grants workspaces only for roles in the user role list', () => {
    expect(canAccessWorkspace('ADMIN', ['ADMIN'])).toBe(true);
    expect(canAccessWorkspace('VENDOR', ['VENDOR'])).toBe(true);
    expect(canAccessWorkspace('ADMIN', ['VENDOR'])).toBe(false);
    expect(canAccessWorkspace('VENDOR', ['ADMIN'])).toBe(false);
    expect(canAccessWorkspace('ADMIN', ['CUSTOMER'])).toBe(false);
    expect(canAccessWorkspace('VENDOR', ['CUSTOMER'])).toBe(false);
    expect(canAccessWorkspace('VENDOR', ['CUSTOMER', 'VENDOR'])).toBe(true);
  });

  test('does not route pending vendors into the protected workspace', () => {
    expect(workspaceHome('VENDOR', 'PENDING')).toBe('/vendor/application-status');
    expect(workspaceHome('VENDOR', 'SUSPENDED')).toBe('/vendor/application-status');
    expect(workspaceHome('VENDOR', 'APPROVED')).toBe('/vendor/dashboard');
  });

  test('offers vendor fulfillment steps in backend-supported order and stops at terminal states', () => {
    expect(nextVendorOrderAction('PLACED')).toEqual({ status: 'ACCEPTED', label: 'Accept order' });
    expect(nextVendorOrderAction('ACCEPTED')).toEqual({ status: 'PACKED', label: 'Mark packed' });
    expect(nextVendorOrderAction('PACKED')).toEqual({
      status: 'SHIPPED',
      label: 'Add tracking and ship',
    });
    expect(nextVendorOrderAction('SHIPPED')).toEqual({
      status: 'DELIVERED',
      label: 'Mark delivered',
    });
    expect(nextVendorOrderAction('DELIVERED')).toBeNull();
    expect(nextVendorOrderAction('CANCELLED')).toBeNull();
  });
});
