/**
 * Socket.io singleton.
 * Call initSocketServer(httpServer) once from index.js.
 *
 * Rooms:
 *  - room:admin — Admin dashboards
 *  - room:responder — on-duty Responders
 *  - user:{userId} — targeted user (assigned responder, etc.)
 *  - incident:{incidentId} — incident channel participants
 */
import { Server } from 'socket.io';

/** @type {import('socket.io').Server | null} */
let io = null;

export const ROOMS = {
  ADMIN:     'room:admin',
  RESPONDER: 'room:responder',
};

/** @param {import('http').Server} httpServer */
export function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    const { role, incidentId, userId } = socket.handshake.auth ?? {};
    if (role === 'Admin') socket.join(ROOMS.ADMIN);
    if (role === 'Responder') socket.join(ROOMS.RESPONDER);
    if (userId) socket.join(`user:${userId}`);
    if (incidentId) socket.join(`incident:${incidentId}`);
  });

  return io;
}

export function getIo() {
  return io;
}

/** @param {unknown} incident */
export function emitIncidentNew(incident) {
  if (!io) return;
  io.to(ROOMS.ADMIN).emit('incident:new', incident);
  io.to(ROOMS.RESPONDER).emit('incident:new', incident);
}

/** @param {unknown} incident */
export function emitIncidentUpdated(incident) {
  if (!io) return;
  const inc = /** @type {any} */ (incident);
  io.to(ROOMS.ADMIN).emit('incident:updated', inc);
  io.to(ROOMS.RESPONDER).emit('incident:updated', inc);
  if (inc?.id) io.to(`incident:${inc.id}`).emit('incident:updated', inc);
}

/**
 * Escalation / high-priority path — assigned responder + Admin + incident room.
 * @param {unknown} incident
 */
export function emitIncidentEscalated(incident) {
  if (!io) return;
  const inc = /** @type {any} */ (incident);
  io.to(ROOMS.ADMIN).emit('incident:escalated', inc);
  io.to(ROOMS.RESPONDER).emit('incident:escalated', inc);
  if (inc?.assigned_responder_id) {
    io.to(`user:${inc.assigned_responder_id}`).emit('incident:escalated', inc);
  }
  if (inc?.id) io.to(`incident:${inc.id}`).emit('incident:escalated', inc);
}

/**
 * AI transcript + summary ready — Admin dashboards only (Module 6).
 * @param {unknown} incident
 */
export function emitIncidentAiReady(incident) {
  if (!io) return;
  const inc = /** @type {any} */ (incident);
  io.to(ROOMS.ADMIN).emit('incident:ai_ready', inc);
}

/**
 * Terminal resolution — incident room + Admin.
 * @param {unknown} incident
 */
export function emitIncidentResolved(incident) {
  if (!io) return;
  const inc = /** @type {any} */ (incident);
  io.to(ROOMS.ADMIN).emit('incident:resolved', inc);
  if (inc?.id) io.to(`incident:${inc.id}`).emit('incident:resolved', inc);
  if (inc?.assigned_responder_id) {
    io.to(`user:${inc.assigned_responder_id}`).emit('incident:resolved', inc);
  }
}
