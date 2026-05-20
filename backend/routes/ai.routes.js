const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const Complaint = require('../models/complaint');
const AIChatHistory = require('../models/AIChatHistory');
const { authenticateToken, isAdmin } = require('../middleware/auth');

// 🎯 Analyze Complaint
router.post('/analyze/:complaintId', async (req, res) => {
  try {
    console.log('\n🔍 Analyzing complaint:', req.params.complaintId);
    
    const complaint = await Complaint.findById(req.params.complaintId);
    
    if (!complaint) {
      console.log('❌ Complaint not found:', req.params.complaintId);
      return res.status(404).json({ message: 'Complaint not found' });
    }

    console.log('📝 Found complaint:', {
      _id: complaint._id,
      title: complaint.title,
      category: complaint.category,
      priority: complaint.priority
    });

    try {
      const analysis = await aiService.analyzeComplaint(complaint);
      
      if (!analysis) {
        throw new Error('Analysis returned null');
      }

      // Update complaint with AI analysis
      complaint.ai_analysis = analysis.ai_analysis;
      complaint.ai_insights = analysis.ai_insights;
      await complaint.save();

      console.log('✅ Analysis completed and saved');
      res.json({
        success: true,
        analysis: analysis
      });
    } catch (aiError) {
      console.error('❌ AI Service Error:', aiError.message);
      
      // Provide fallback response when Ollama is unavailable
      if (aiError.message.includes('AI service unavailable') || aiError.message.includes('ECONNREFUSED')) {
        console.log('⚠️ Ollama unavailable, providing basic analysis...');
        
        const fallbackAnalysis = {
          ai_analysis: {
            suggested_category: complaint.category,
            suggested_severity: complaint.priority || 'medium',
            sentiment_score: 0,
            priority_score: 5,
            confidence_level: 0.3,
            key_issues: ['Pending AI service availability'],
            suggested_actions: ['Retry when Ollama service is available'],
            analyzed_at: new Date()
          },
          ai_insights: {
            summary: `Basic analysis of ${complaint.category} complaint: ${complaint.title}`,
            urgency_reason: 'AI service temporarily unavailable. Using basic categorization.',
            department_suggestion: 'Community Services',
            estimated_resolution_time: '3-5 business days'
          }
        };
        
        return res.status(503).json({
          success: false,
          message: 'AI service unavailable - basic analysis provided',
          analysis: fallbackAnalysis,
          note: 'Ensure Ollama is running at ' + process.env.OLLAMA_URL
        });
      }
      
      throw aiError;
    }
  } catch (error) {
    console.error('❌ Analyze Complaint Fatal Error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message,
      troubleshot: 'Check if Ollama service is running at ' + process.env.OLLAMA_URL
    });
  }
});

// 📊 Get Dashboard Insights
router.get('/insights', async (req, res) => {
  try {
    const insights = await aiService.generateDashboardInsights();
    
    res.json({
      success: true,
      insights: insights
    });
  } catch (error) {
    console.error('Dashboard Insights Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// 💬 AI Chat
router.post('/chat', async (req, res) => {
  try {
    const { messages, sessionId, context } = req.body;
    
    const response = await aiService.chatWithAssistant(messages, context);
    
    // Save chat history
    await AIChatHistory.findOneAndUpdate(
      { session_id: sessionId, admin_id: req.user?.userId },
      {
        $push: {
          messages: [
            ...messages.filter(m => m.role === 'user'),
            { role: 'assistant', content: response, timestamp: new Date() }
          ]
        },
        context: context
      },
      { upsert: true, new: true }
    );
    
    res.json({
      success: true,
      response: response
    });
  } catch (error) {
    console.error('AI Chat Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// 🎯 Suggest Actions
router.get('/suggest-actions/:complaintId', async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.complaintId);
    
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    const actions = await aiService.suggestActions(complaint);
    
    res.json({
      success: true,
      actions: actions
    });
  } catch (error) {
    console.error('Suggest Actions Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// 🔄 Batch Analyze All Pending
router.post('/batch-analyze', async (req, res) => {
  try {
    const pendingComplaints = await Complaint.find({
      status: 'Pending',
      'ai_analysis.analyzed_at': { $exists: false }
    }).limit(10);

    const results = [];
    
    for (const complaint of pendingComplaints) {
      const analysis = await aiService.analyzeComplaint(complaint);
      if (analysis) {
        complaint.ai_analysis = analysis.ai_analysis;
        complaint.ai_insights = analysis.ai_insights;
        await complaint.save();
        results.push(complaint._id);
      }
    }

    res.json({
      success: true,
      analyzed: results.length,
      complaint_ids: results
    });
  } catch (error) {
    console.error('Batch Analyze Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;