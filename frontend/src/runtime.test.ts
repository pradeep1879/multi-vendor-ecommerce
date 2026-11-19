import { describe, expect, test } from 'bun:test';

describe('frontend runtime baseline', () => {
  test('provides browser APIs used by the application', () => {
    expect(typeof Response).toBe('function');
  });
});
