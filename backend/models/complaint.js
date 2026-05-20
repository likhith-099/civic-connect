const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  user_id: { type: String, index: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  location: { type: String, required: true },
  location_details: { type: String, default: '' },
  geo: {
    latitude: { type: Number },
    longitude: { type: Number },
    accuracy_m: { type: Number },
  },
  category: { type: String, required: true, enum: ['road', 'water', 'electricity', 'garbage', 'roads', 'waste', 'sanitation', 'traffic', 'parks', 'pollution', 'construction', 'other'] },
  severity: { type: String, default: 'low', enum: ['low', 'medium', 'high', 'critical'] },
  priority: { type: String, default: 'low', enum: ['low', 'medium', 'high', 'critical'] },
  status: { type: String, default: 'pending', enum: ['pending', 'in progress', 'completed', 'resolved'] },
  image: { type: String }, // base64 encoded image
  votes: { type: Number, default: 0 },
  supported_by: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  // AI Analysis fields
  ai_analysis: {
    suggested_category: String,
    suggested_severity: String,
    sentiment_score: Number,
    priority_score: Number,
    confidence_level: Number,
    key_issues: [String],
    suggested_actions: [String],
    analyzed_at: Date
  },
  ai_insights: {
    summary: String,
    urgency_reason: String,
    department_suggestion: String,
    estimated_resolution_time: String
  }
});

module.exports = mongoose.model('Complaint', complaintSchema);
