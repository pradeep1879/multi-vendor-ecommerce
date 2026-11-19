import { disconnectDatabase } from '../../infrastructure/database/client.js';
import { OrdersRepository } from './orders.repository.js';

try {
  const count = await new OrdersRepository().expireReservations();
  process.stdout.write(`Expired ${count} payment reservation(s).\n`);
} catch (error: unknown) {
  process.stderr.write('Order reservation expiry job failed.\n');
  process.exitCode = 1;
  if (process.env.NODE_ENV !== 'production' && error instanceof Error)
    process.stderr.write(`${error.name}: ${error.message}\n`);
} finally {
  await disconnectDatabase();
}
