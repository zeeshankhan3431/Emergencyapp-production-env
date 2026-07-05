import { logAuditEvent } from '../services/auditService.js';

/**
 * Logs authenticated API requests to DynamoDB (or memory when disabled).
 * @returns {import('express').RequestHandler}
 */
export function auditLogger() {
  return (req, res, next) => {
    res.on('finish', () => {
      const u = req.user;
      if (!u?.id || res.statusCode >= 500) return;
      void logAuditEvent({
        userId: u.id,
        action: `${req.method} ${req.originalUrl.split('?')[0]}`,
        ip: req.ip,
        userAgent: req.get('user-agent') ?? null,
        statusCode: res.statusCode,
      });
    });
    next();
  };
}
