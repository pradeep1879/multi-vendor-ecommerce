import { describe, expect, test } from 'bun:test';
import { canAccessWorkspace, nextVendorOrderAction, workspaceHome } from './workspace-access';

describe('workspace access routing', () => {
  test('routes each signed-in role to its own dashboard', () => {
    expect(workspaceHome('ADMIN')).toBe('/admin/dashboard');
    expect(workspaceHome('VENDOR')).toBe('/vendor/dashboard');
    expect(workspaceHome('CUSTOMER')).toBe('/account');
  });

  test('grants workspace access only to the matching role', () => {
    expect(canAccessWorkspace('ADMIN', 'ADMIN')).toBe(true);
    expect(canAccessWorkspace('VENDOR', 'VENDOR')).toBe(true);
    expect(canAccessWorkspace('ADMIN', 'VENDOR')).toBe(false);
    expect(canAccessWorkspace('VENDOR', 'ADMIN')).toBe(false);
    expect(canAccessWorkspace('ADMIN', 'CUSTOMER')).toBe(false);
    expect(canAccessWorkspace('VENDOR', 'CUSTOMER')).toBe(false);
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
