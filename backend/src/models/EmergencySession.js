/**
 * EmergencySession.js
 * Mongoose model for emergency sessions.
 *
 * npm install mongoose
 */

const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false },
);

const emergencySessionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['ESCALATING', 'ACTIVE', 'RESOLVED'],
      default: 'ESCALATING',
    },
    platform: { type: String, enum: ['android', 'ios'], required: true },
    scenarioMessage: { type: String, default: 'Emergency – I need help.' },
    location: { type: locationSchema, default: null },
    impactTimestamp: { type: Number, required: true }, // epoch ms
    resolvedAt: { type: Date, default: null },
    resolvedReason: {
      type: String,
      enum: ['user_cancelled', 'responders_notified', null],
      default: null,
    },
  },
  {
    timestamps: true, // createdAt, updatedAt
  },
);

module.exports = mongoose.model('EmergencySession', emergencySessionSchema);