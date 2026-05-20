const mongoose = require('mongoose');

const AIInsightSchema = new mongoose.Schema({
  insight_type: {
    type: String,
    enum: ['trend', 'pattern', 'alert', 'recommendation'],
    required: true
  },
  title: { type: String, required: true },
  description: { type: String, required: true },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  affected_regions: [String],
  related_complaints: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Complaint' }],
  data: mongoose.Schema.Types.Mixed,
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  expires_at: Date
});

module.exports = mongoose.model('AIInsight', AIInsightSchema);