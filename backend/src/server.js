/**
 * server.js — Unified Emergency Response + Dashboard API Server (ESM)
 *
 * Combines:
 *  - Original emergency session routes (/api/emergency)
 *  - Full dashboard API (auth, incidents, equipment, analytics, dashboard, etc.)
 *  - MongoDB (Mongoose) for emergency sessions
 *  - PostgreSQL / in-memory pg-mem for dashboard data
 *  - Socket.IO for real-time dashboard updates
 */

import 'dotenv/config';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';

// ── Emergency (original) routes ───────────────────────────────────────────────
import emergencyRoutes from './routes/emergency.js';

// ── Dashboard server pieces ───────────────────────────────────────────────────
import { createApp as mountDashboardRoutes } from './dashboard/app.js';
import { initLocalDatabaseIfNeeded } from './dashboard/db/initLocalMemoryDb.js';
import { initSocketServer } from './dashboard/services/socketService.js';
import { runMigrations } from './dashboard/db/migrate.js';

const PORT = Number(process.env.PORT) || 5000;

async function main() {
  // ── 1. Init in-memory / real PostgreSQL (dashboard) ────────────────────────
  await initLocalDatabaseIfNeeded();

  if (process.env.RUN_MIGRATIONS === 'true' && process.env.DATABASE_URL?.trim()) {
    await runMigrations();
    console.log('[db] Database migrations applied.');
  } else if (process.env.RUN_MIGRATIONS === 'true' && process.env.__ERA_MEMORY_DB === 'true') {
    console.log('[db] RUN_MIGRATIONS ignored for in-memory database (schema already applied).');
  }

  // ── 2. Build Express app ────────────────────────────────────────────────────
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  // ── 3. Mount original emergency routes ─────────────────────────────────────
  app.get('/', (_req, res) => res.send('Emergency Response Backend Running'));
  app.use('/api/emergency', emergencyRoutes);

  // ── 4. Mount all dashboard routes (auth, incidents, equipment, etc.) ────────
  //  createApp() returns an Express app with all dashboard routes already
  //  attached; we copy them onto our unified app by re-mounting its router.
  const dashApp = mountDashboardRoutes();
  // Mount dashboard's internal router onto our main app
  app.use(dashApp);

  // ── 5. Connect MongoDB (emergency sessions) ─────────────────────────────────
  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/emergency-response';
  mongoose.connect(MONGO_URI)
    .then(() => console.log('[mongo] MongoDB connected'))
    .catch(err => console.error('[mongo] Connection error:', err));

  // ── 6. Create HTTP server + Socket.IO ───────────────────────────────────────
  const httpServer = http.createServer(app);
  initSocketServer(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
    console.log(`[server] SKIP_AUTH=${process.env.SKIP_AUTH ?? 'unset'}`);
  });
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
