import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { initLocalDatabaseIfNeeded } from './db/initLocalMemoryDb.js';
import { initSocketServer } from './services/socketService.js';

const PORT = Number(process.env.PORT) || 3001;

async function main() {
  await initLocalDatabaseIfNeeded();

  if (process.env.RUN_MIGRATIONS === 'true' && process.env.DATABASE_URL?.trim()) {
    await runMigrations();
    console.log('Database migrations applied.');
  } else if (process.env.RUN_MIGRATIONS === 'true' && process.env.__ERA_MEMORY_DB === 'true') {
    console.log('[db] RUN_MIGRATIONS ignored for in-memory database (schema already applied).');
  }

  const app = createApp();
  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`API + WebSocket listening on http://localhost:${PORT}`);
    console.log(`SKIP_AUTH=${process.env.SKIP_AUTH ?? 'unset'}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
