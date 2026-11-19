import { disconnectDatabase } from '../../infrastructure/database/client.js';
import { processSearchOutboxBatch, reindexProducts } from './search-jobs.js';

const command = process.argv[2];
try {
  if (command === 'reindex') {
    const count = await reindexProducts();
    process.stdout.write(`Reindexed ${count} eligible products.\n`);
  } else if (command === 'worker') {
    for (;;) {
      const processed = await processSearchOutboxBatch();
      if (processed === 0) await Bun.sleep(1000);
    }
  } else {
    throw new Error('Usage: bun run search:reindex | bun run search:worker');
  }
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Search command failed.'}\n`);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
