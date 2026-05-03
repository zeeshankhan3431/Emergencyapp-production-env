/**
 * emergency.js — Emergency session routes (ESM)
 */

import express from 'express';
import EmergencySession from '../models/EmergencySession.js';
import { sendEmergencyNotification } from '../services/notificationService.js';

const router = express.Router();

// ── POST /api/emergency/sessions ──────────────────────────────────────────────
router.post('/sessions', async (req, res) => {
  try {
    const {
      userId,
      scenarioMessage,
      location,
      platform,
      impactTimestamp,
      evidenceConsent,
      emergencyContacts,
    } = req.body;

    if (!userId || !platform || !impactTimestamp) {
      return res.status(400).json({
        error: 'userId, platform, and impactTimestamp are required.',
      });
    }

    const session = await EmergencySession.create({
      userId,
      scenarioMessage: scenarioMessage || 'Emergency – I need help.',
      location: location || null,
      platform,
      impactTimestamp,
      evidenceConsent: evidenceConsent || { granted: false, grantedAt: null, version: 'v1' },
      emergencyContacts: Array.isArray(emergencyContacts) ? emergencyContacts : [],
      status: 'ESCALATING',
    });

    // Fire notification async — don't block response
    sendEmergencyNotification(session).catch(err =>
      console.error('[EmergencyRoute] Notification error:', err),
    );

    return res.status(201).json({
      sessionId: session._id.toString(),
      status: session.status,
    });
  } catch (err) {
    console.error('[EmergencyRoute] POST /sessions error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PATCH /api/emergency/sessions/:id ────────────────────────────────────────
router.patch('/sessions/:id', async (req, res) => {
  try {
    const updates = {};
    if (req.body.location) updates.location = req.body.location;
    if (req.body.status) updates.status = req.body.status;

    const session = await EmergencySession.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true },
    );

    if (!session) return res.status(404).json({ error: 'Session not found.' });
    return res.json({ sessionId: session._id.toString(), status: session.status });
  } catch (err) {
    console.error('[EmergencyRoute] PATCH /sessions/:id error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── PATCH /api/emergency/sessions/:id/resolve ─────────────────────────────────
router.patch('/sessions/:id/resolve', async (req, res) => {
  try {
    const { reason } = req.body;
    const session = await EmergencySession.findByIdAndUpdate(
      req.params.id,
      {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedReason: reason || 'user_cancelled',
      },
      { new: true },
    );

    if (!session) return res.status(404).json({ error: 'Session not found.' });
    return res.json({ sessionId: session._id.toString(), status: session.status });
  } catch (err) {
    console.error('[EmergencyRoute] PATCH /resolve error:', err);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/emergency/sessions ───────────────────────────────────────────────
router.get('/sessions', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sessions = await EmergencySession.find()
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    const total = await EmergencySession.countDocuments();
    return res.json({ sessions, total, page, limit });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

// ── GET /api/emergency/sessions/:id ──────────────────────────────────────────
router.get('/sessions/:id', async (req, res) => {
  try {
    const session = await EmergencySession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Not found.' });
    return res.json(session);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

export default router;