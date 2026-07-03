import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.js';
import qrRoutes from './routes/qr.js';
import equipmentRoutes from './routes/equipment.js';
import defectRoutes from './routes/defects.js';
import incidentsRoutes from './routes/incidents.js';
import evidenceRoutes from './routes/evidence.js';
import dashboardRoutes from './routes/dashboard.js';
import analyticsRoutes from './routes/analytics.js';
import publicRoutes from './routes/public.js';
import devicesRoutes from './routes/devices.js';
import userNotificationPrefsRoutes from './routes/userNotificationPrefs.js';
import { authenticateJWT } from './middleware/authenticateJWT.js';
import { auditLogger } from './middleware/auditLogger.js';
import { requireRole } from './middleware/requireRole.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'security-app-api',
      skipAuth: process.env.SKIP_AUTH === 'true',
      time: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);

  app.use('/api/public', publicRoutes);

  app.use('/api/devices', authenticateJWT(), auditLogger(), devicesRoutes);
  app.use('/api/users', authenticateJWT(), auditLogger(), userNotificationPrefsRoutes);

  // Incidents: any authenticated user can trigger (POST); per-route RBAC inside the router
  app.use('/api/incidents', authenticateJWT(), auditLogger(), incidentsRoutes);

  // Evidence: authenticated user; per-route RBAC inside the router (Admin for access-url)
  app.use('/api/evidence', authenticateJWT(), auditLogger(), evidenceRoutes);

  // Remaining operational APIs: Admin | Responder | Analyst
  const adminChain = [
    authenticateJWT(),
    auditLogger(),
    requireRole('Admin', 'Responder', 'Analyst'),
  ];
  app.use('/api/qr',        ...adminChain, qrRoutes);
  app.use('/api/equipment', ...adminChain, equipmentRoutes);
  app.use('/api/defects',   ...adminChain, defectRoutes);
  app.use('/api/dashboard', authenticateJWT(), auditLogger(), dashboardRoutes);
  app.use('/api/analytics', authenticateJWT(), auditLogger(), analyticsRoutes);

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL', message: err.message });
  });

  return app;
}
