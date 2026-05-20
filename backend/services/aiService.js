const ollamaClient = require('./ollamaClient');
const Complaint = require('../models/complaint');
const AIInsight = require('../models/AIInsight');

// Allowed values for validation
const ALLOWED_CATEGORIES = ['roads', 'water', 'electricity', 'waste', 'sanitation', 'traffic', 'parks', 'pollution', 'construction', 'other'];
const ALLOWED_SEVERITIES = ['low', 'medium', 'high', 'critical'];

class AIService {
  // Sleep utility for retry delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Retry wrapper with exponential backoff
  async withRetry(fn, maxRetries = 2) {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        console.log(`⚠️ Attempt ${attempt + 1}/${maxRetries + 1} failed:`, error.message);

        if (attempt < maxRetries) {
          const delay = 1000 * Math.pow(2, attempt); // 1s, 2s
          console.log(`   Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  // Multi-stage JSON parsing with fallback
  parseJSONResponse(response) {
    if (!response || typeof response !== 'string') {
      throw new Error('Invalid response type');
    }

    // Stage 1: Strip markdown code blocks
    let cleaned = response.trim();
    cleaned = cleaned.replace(/^```json\s*/i, '');
    cleaned = cleaned.replace(/^```\s*/i, '');
    cleaned = cleaned.replace(/```$/gm, '');
    cleaned = cleaned.trim();

    // Stage 2: Try direct parse
    try {
      return JSON.parse(cleaned);
    } catch (e) {
      // Continue to next stage
    }

    // Stage 3: Find JSON object in response
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        // Continue to next stage
      }
    }

    // Stage 4: Try to fix common JSON issues
    try {
      // Remove trailing commas
      cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
      // Fix unquoted keys (basic)
      cleaned = cleaned.replace(/([{,])\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
      return JSON.parse(cleaned);
    } catch (e) {
      // Continue to final stage
    }

    throw new Error('Failed to parse JSON from response');
  }

  // Validate and normalize category
  validateCategory(category) {
    if (!category) return 'other';

    const normalized = category.toLowerCase().trim();
    if (ALLOWED_CATEGORIES.includes(normalized)) {
      return normalized;
    }

    // Try partial match
    for (const allowed of ALLOWED_CATEGORIES) {
      if (normalized.includes(allowed)) {
        return allowed;
      }
    }

    return 'other';
  }

  // Validate and normalize severity
  validateSeverity(severity) {
    if (!severity) return 'medium';

    const normalized = severity.toLowerCase().trim();
    if (ALLOWED_SEVERITIES.includes(normalized)) {
      return normalized;
    }

    return 'medium';
  }

  // Validate sentiment score
  validateSentimentScore(score) {
    const num = parseFloat(score);
    if (isNaN(num) || num < -1) return 0;
    if (num > 1) return 1;
    return num;
  }

  // Validate priority score
  validatePriorityScore(score) {
    const num = parseInt(score);
    if (isNaN(num) || num < 1) return 5;
    if (num > 10) return 10;
    return num;
  }

  // Validate confidence level
  validateConfidence(score) {
    const num = parseFloat(score);
    if (isNaN(num) || num < 0) return 0.5;
    if (num > 1) return 1;
    return num;
  }

  // Normalize and validate the full analysis
  normalizeAnalysis(analysis, fallbackCategory) {
    return {
      suggested_category: this.validateCategory(analysis.suggested_category) || fallbackCategory || 'other',
      suggested_severity: this.validateSeverity(analysis.suggested_severity),
      sentiment_score: this.validateSentimentScore(analysis.sentiment_score),
      priority_score: this.validatePriorityScore(analysis.priority_score),
      confidence_level: this.validateConfidence(analysis.confidence_level),
      key_issues: Array.isArray(analysis.key_issues) ? analysis.key_issues : [],
      suggested_actions: Array.isArray(analysis.suggested_actions) ? analysis.suggested_actions : [],
      analyzed_at: new Date()
    };
  }

  // 🎯 Analyze Single Complaint
  async analyzeComplaint(complaint) {
    // Validate complaint data
    if (!complaint || !complaint.title || !complaint.description) {
      console.error('Invalid complaint data:', complaint);
      throw new Error('Complaint data is incomplete');
    }

    const systemPrompt = `You are a civic issue analysis AI. Analyze complaints and provide structured insights.
Return ONLY valid JSON with this exact structure:
{
  "suggested_category": "one of: roads, water, electricity, waste, sanitation, traffic, parks, pollution, construction, other",
  "suggested_severity": "one of: low, medium, high, critical",
  "sentiment_score": number between -1 and 1,
  "priority_score": number between 1 and 10,
  "confidence_level": number between 0 and 1,
  "key_issues": ["issue1", "issue2"],
  "suggested_actions": ["action1", "action2"],
  "summary": "brief summary",
  "urgency_reason": "why this is urgent or not",
  "department_suggestion": "which department should handle this",
  "estimated_resolution_time": "estimated time like '2-3 days'"
}`;

    const prompt = `Analyze this civic complaint:
Title: ${complaint.title}
Description: ${complaint.description}
Location: ${complaint.location || 'Unknown'}
Current Category: ${complaint.category}
Current Priority: ${complaint.priority || 'Not set'}

Provide analysis as JSON:`;

    try {
      console.log('📋 Analyzing complaint with data:', {
        id: complaint._id,
        title: complaint.title,
        category: complaint.category,
        priority: complaint.priority
      });

      // Use retry wrapper for resilience
      const response = await this.withRetry(async () => {
        return await ollamaClient.generate(prompt, systemPrompt);
      }, 2);

      console.log('✅ Ollama response received:', response.substring(0, 100) + '...');

      // Parse JSON with multi-stage fallback
      let analysis;
      try {
        analysis = this.parseJSONResponse(response);
        console.log('✅ Analysis parsed successfully');
      } catch (parseError) {
        console.error('⚠️ JSON parse failed, using fallback analysis');
        analysis = {};
      }

      // Validate and normalize the analysis
      const normalizedAnalysis = this.normalizeAnalysis(analysis, complaint.category);

      return {
        ai_analysis: normalizedAnalysis,
        ai_insights: {
          summary: analysis.summary || `Analysis of ${complaint.category} complaint`,
          urgency_reason: analysis.urgency_reason || 'Pending AI analysis',
          department_suggestion: analysis.department_suggestion || 'Community Services',
          estimated_resolution_time: analysis.estimated_resolution_time || '3-5 days'
        }
      };
    } catch (error) {
      console.error('❌ AI Analysis Error:', error.message);
      console.error('Error stack:', error.stack);
      throw error; // Let the route handle the error
    }
  }

  // 🔍 Find Similar Complaints
  async findSimilarComplaints(complaint, limit = 5) {
    try {
      // Simple text-based similarity (can be enhanced with embeddings)
      const allComplaints = await Complaint.find({
        _id: { $ne: complaint._id },
        category: complaint.category
      }).limit(limit);

      return allComplaints.map(c => c._id);
    } catch (error) {
      console.error('Similar Complaints Error:', error);
      return [];
    }
  }

  // 📊 Generate Dashboard Insights
  async generateDashboardInsights() {
    try {
      // Get data from last 30 days instead of 7
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const complaints = await Complaint.find({
        createdAt: { $gte: thirtyDaysAgo }
      });

      // Also get all-time data for comparison
      const allComplaints = await Complaint.find();

      // Compute structured data for the AI
      const categoryStats = {};
      const statusStats = {};
      const locationStats = {};
      const priorityStats = { high: 0, medium: 0, low: 0, critical: 0 };
      const recentTrends = [];

      complaints.forEach(c => {
        categoryStats[c.category] = (categoryStats[c.category] || 0) + 1;
        statusStats[c.status] = (statusStats[c.status] || 0) + 1;
        if (c.location) {
          const locationKey = c.location.length > 30 ? c.location.substring(0, 30) + '...' : c.location;
          locationStats[locationKey] = (locationStats[locationKey] || 0) + 1;
        }
        const p = (c.priority || c.severity || 'low').toLowerCase();
        if (priorityStats[p] !== undefined) priorityStats[p]++;
      });

      // Calculate trends by comparing to previous period
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const previousPeriodComplaints = await Complaint.find({
        createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo }
      });

      const prevCategoryStats = {};
      previousPeriodComplaints.forEach(c => {
        prevCategoryStats[c.category] = (prevCategoryStats[c.category] || 0) + 1;
      });

      // Find trending categories
      const categoryChanges = Object.entries(categoryStats).map(([cat, count]) => {
        const prevCount = prevCategoryStats[cat] || 0;
        const change = prevCount > 0 ? ((count - prevCount) / prevCount * 100).toFixed(1) : 'new';
        return { category: cat, count, change };
      }).sort((a, b) => parseFloat(b.change) - parseFloat(a.change));

      const topHotspots = Object.entries(locationStats)
        .map(([location, count]) => ({ location, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const urgentComplaints = complaints.filter(c =>
        c.priority === 'high' || c.severity === 'high' || c.severity === 'critical'
      ).slice(0, 5);

      const prompt = `Analyze civic complaint data and provide insights for a municipal admin dashboard.

CURRENT PERIOD DATA (Last 30 days): ${complaints.length} complaints
- Categories: ${JSON.stringify(categoryStats)}
- Status breakdown: ${JSON.stringify(statusStats)}
- Priority breakdown: ${JSON.stringify(priorityStats)}

TOP HOTSPOTS (by location):
${topHotspots.map(h => `- ${h.location}: ${h.count} complaints`).join('\n')}

CATEGORY TRENDS (vs previous 30 days):
${categoryChanges.slice(0, 5).map(c => `- ${c.category}: ${c.count} (${c.change}% change)`).join('\n')}

URGENT ISSUES (high/critical priority):
${urgentComplaints.map(c => `- ${c.title} (${c.priority || c.severity}) - ${c.status}`).join('\n')}

ALL-TIME STATS: ${allComplaints.length} total complaints

Provide JSON with:
{
  "trends": ["3-4 key observations about complaint patterns"],
  "hotspots": ["2-3 areas/locations with most complaints"],
  "urgent_issues": ["2-3 specific complaints needing attention"],
  "recommendations": ["3-4 actionable suggestions for the admin"]
}`;

      // Use retry wrapper
      const response = await this.withRetry(async () => {
        return await ollamaClient.generate(prompt);
      }, 2);

      try {
        const insights = this.parseJSONResponse(response);
        return insights;
      } catch (parseError) {
        console.error('Failed to parse dashboard insights:', parseError.message);
        // Fallback to computed insights instead of null
        return this.getComputedInsights(categoryStats, statusStats, priorityStats, topHotspots, categoryChanges, urgentComplaints);
      }
    } catch (error) {
      console.error('Dashboard Insights Error:', error);
      // Return computed fallback on error
      return this.getComputedInsightsFallback();
    }
  }

  // Fallback: Compute insights from database when AI fails
  getComputedInsights(categoryStats, statusStats, priorityStats, topHotspots, categoryChanges, urgentComplaints) {
    const trends = [];
    const maxCat = Object.entries(categoryStats).sort((a, b) => b[1] - a[1])[0];
    if (maxCat) trends.push(`${maxCat[0]} is the most common complaint category with ${maxCat[1]} reports`);

    if (categoryChanges[0] && categoryChanges[0].change !== 'new') {
      trends.push(`${categoryChanges[0].category} shows ${categoryChanges[0].change > 0 ? 'increasing' : 'decreasing'} trend (${categoryChanges[0].change}%)`);
    }

    const pending = (statusStats['pending'] || 0);
    if (pending > 10) trends.push(`${pending} complaints remain pending - consider prioritizing resolution`);

    const hotspots = topHotspots.slice(0, 3).map(h => h.location);

    const urgentIssues = urgentComplaints.map(c => `${c.title} (${c.priority || c.severity})`);

    const recommendations = [
      'Review and prioritize high-priority complaints',
      `Address top hotspot: ${hotspots[0] || 'N/A'}`,
      pending > 5 ? 'Clear pending complaints backlog' : 'Maintain current resolution pace'
    ];

    return { trends, hotspots, urgent_issues: urgentIssues, recommendations };
  }

  getComputedInsightsFallback() {
    return {
      trends: ['Unable to generate AI insights - please check Ollama service'],
      hotspots: [],
      urgent_issues: [],
      recommendations: ['Ensure Ollama is running for AI-powered insights']
    };
  }

  // 💬 AI Chat Assistant
  async chatWithAssistant(messages, context = {}) {
    try {
      // Get real-time complaint data for context
      const recentStats = await this.getComplaintStats();
      const recentComplaints = await Complaint.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .select('title category status priority createdAt');

      const systemMessage = {
        role: 'system',
        content: `You are a Civic Complaint Analysis Assistant for municipal administrators.

Your role is to help administrators:
1. Analyze complaint trends and patterns
2. Suggest actions for specific complaints
3. Identify urgent issues requiring attention
4. Provide department allocation recommendations
5. Explain complaint patterns and statistics

IMPORTANT RULES:
- ONLY answer questions related to civic complaints, municipal services, and community issues
- If asked about unrelated topics (weather, sports, politics, etc.), politely decline
- Use the provided complaint data to give specific, relevant answers
- When you don't have specific data, say so honestly
- Keep responses concise and actionable for admins

CURRENT SYSTEM STATS:
- Total complaints: ${recentStats.total}
- Pending: ${recentStats.pending} | In Progress: ${recentStats.inProgress} | Resolved: ${recentStats.resolved}
- Top categories: ${recentStats.topCategories.map(c => `${c._id}(${c.count})`).join(', ') || 'N/A'}
- Recent high-priority complaints: ${recentStats.highPriorityCount}

RECENT COMPLAINTS (for reference):
${recentComplaints.map(c => `- ${c.title} | ${c.category} | ${c.status} | ${c.priority}`).join('\n')}

Provide helpful, specific answers based on this data.`
      };

      const allMessages = [systemMessage, ...messages];

      // Use retry wrapper
      const response = await this.withRetry(async () => {
        return await ollamaClient.chat(allMessages);
      }, 2);

      return response;
    } catch (error) {
      console.error('AI Chat Error:', error);
      return 'Sorry, I encountered an error. Please ensure Ollama is running and try again.';
    }
  }

  // Helper: Get complaint statistics for context
  async getComplaintStats() {
    try {
      const allComplaints = await Complaint.find();

      const byStatus = {};
      const byCategory = {};
      let highPriorityCount = 0;

      allComplaints.forEach(c => {
        byStatus[c.status] = (byStatus[c.status] || 0) + 1;
        byCategory[c.category] = (byCategory[c.category] || 0) + 1;
        if (c.priority === 'high' || c.severity === 'high' || c.severity === 'critical') {
          highPriorityCount++;
        }
      });

      const topCategories = Object.entries(byCategory)
        .map(([ _id, count ]) => ({ _id, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        total: allComplaints.length,
        pending: byStatus['pending'] || 0,
        inProgress: (byStatus['in progress'] || byStatus['in-progress'] || 0),
        resolved: (byStatus['resolved'] || byStatus['completed'] || 0),
        highPriorityCount,
        topCategories
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return { total: 0, pending: 0, inProgress: 0, resolved: 0, highPriorityCount: 0, topCategories: [] };
    }
  }

  // 🎯 Smart Action Suggestions
  async suggestActions(complaint) {
    const prompt = `Given this complaint:
Title: ${complaint.title}
Type: ${complaint.category}
Priority: ${complaint.priority}
Status: ${complaint.status}

Suggest 3 specific actions an admin should take. Return as JSON array:
["action1", "action2", "action3"]`;

    try {
      // Use retry wrapper
      const response = await this.withRetry(async () => {
        return await ollamaClient.generate(prompt);
      }, 2);

      try {
        const actions = this.parseJSONResponse(response);
        if (Array.isArray(actions)) {
          return actions;
        }
      } catch (parseError) {
        // Try extracting array directly
        const arrayMatch = response.match(/\[[\s\S]*\]/);
        if (arrayMatch) {
          try {
            return JSON.parse(arrayMatch[0]);
          } catch (e) {
            // Fall through to return empty array
          }
        }
      }

      return [];
    } catch (error) {
      console.error('Action Suggestions Error:', error);
      return [];
    }
  }
}

module.exports = new AIService();