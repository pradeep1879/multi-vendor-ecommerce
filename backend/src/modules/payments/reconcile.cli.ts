import { disconnectDatabase } from '../../infrastructure/database/client';
import { PaymentsRepository } from './payments.repository';

try {
  const report = await new PaymentsRepository().reconciliationReport();
  process.stdout.write(
    `${JSON.stringify(
      report,
      (_key, value: unknown) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    )}\n`,
  );
} catch (error: unknown) {
  process.stderr.write('Payment reconciliation report failed.\n');
  process.exitCode = 1;
  if (process.env.NODE_ENV !== 'production' && error instanceof Error)
    process.stderr.write(`${error.name}: ${error.message}\n`);
} finally {
  await disconnectDatabase();
}
