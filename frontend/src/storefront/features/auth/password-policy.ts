const checks = [
  ['At least 12 characters', (value: string) => value.length >= 12],
  ['One uppercase letter', (value: string) => /[A-Z]/.test(value)],
  ['One lowercase letter', (value: string) => /[a-z]/.test(value)],
  ['One number', (value: string) => /[0-9]/.test(value)],
  ['One special character', (value: string) => /[^A-Za-z0-9]/.test(value)],
  ['No more than 72 UTF-8 bytes', (value: string) => new TextEncoder().encode(value).length <= 72],
] as const;

export const isStrongPassword = (value: string) => checks.every(([, check]) => check(value));
export const passwordChecks = checks;
