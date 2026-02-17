const mongoose = require("mongoose");

const emergencySessionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  triggerType: {
    type: String,
    enum: ["impact", "manual"],
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "escalated", "cancelled"],
    default: "pending",
  },
  location: {
    lat: Number,
    lng: Number,
  },
  devicePlatform: {
    type: String,
    enum: ["android", "ios"],
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  escalatedAt: {
    type: Date,
  },
});

module.exports = mongoose.model(
  "EmergencySession",
  emergencySessionSchema
);
