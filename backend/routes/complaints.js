const express = require('express');
const router = express.Router();
const multer = require('multer');
const Complaint = require('../models/complaint');
const { authenticateToken } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage() });

// CREATE
router.post('/', upload.single('image'), async (req, res) => {
  try {
    console.log('Request body:', req.body);
    console.log('Request file:', req.file ? 'Image received' : 'No image');
    
    const {
      user_id,
      title,
      description,
      location,
      category,
      severity,
      priority,
      exactLocationNote,
      latitude,
      longitude,
      locationAccuracy,
    } = req.body;

    console.log('Extracted fields:', { title, description, location, category, severity, priority });

    if (!title || !description || !location || !category) {
      console.error('Missing fields:', { title: !!title, description: !!description, location: !!location, category: !!category });
      return res.status(400).json({
        message: 'Missing required fields: title, description, location, category',
        received: { title, description, location, category, severity, priority }
      });
    }

    // Convert image to base64 if present
    let imageData = null;
    if (req.file) {
      imageData = req.file.buffer.toString('base64');
      imageData = `data:${req.file.mimetype};base64,${imageData}`;
      console.log('Image converted to base64, length:', imageData.length);
    }

    const parsedLatitude = Number.parseFloat(latitude);
    const parsedLongitude = Number.parseFloat(longitude);
    const parsedAccuracy = Number.parseFloat(locationAccuracy);

    // Accept severity (frontend) or priority (backend legacy) - normalize to both
    const normalizedSeverity = severity || priority || 'low';

    const complaintData = {
      user_id: user_id ? String(user_id) : undefined,
      title,
      description,
      location,
      location_details: exactLocationNote || '',
      category,
      severity: normalizedSeverity,
      priority: normalizedSeverity,
      image: imageData,
      votes: 0,
      status: 'pending'
    };
    console.log('Creating complaint with user_id:', complaintData.user_id);

    if (Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude)) {
      complaintData.geo = {
        latitude: parsedLatitude,
        longitude: parsedLongitude,
        accuracy_m: Number.isFinite(parsedAccuracy) ? parsedAccuracy : undefined,
      };
    }

    console.log('Creating complaint with data:', { title, description, location, category, priority: complaintData.priority });

    const complaint = await Complaint.create(complaintData);
    console.log('Complaint created:', complaint._id);
    res.status(201).json(complaint);
  } catch (err) {
    console.error('Create complaint error:', err);
    res.status(500).json({ message: 'Failed to create complaint', error: err.message });
  }
});

// GET ALL
router.get('/', async (req, res) => {
  try {
    const complaints = await Complaint.find().sort({ createdAt: -1 });
    res.json(complaints);
  } catch (err) {
    console.error('Get complaints error:', err);
    res.status(500).json({ message: 'Failed to fetch complaints', error: err.message });
  }
});

// GET CURRENT USER COMPLAINTS (optional auth)
router.get('/my-complaints', async (req, res) => {
  try {
    // Check for auth token
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      // No token - return empty array (user not logged in)
      return res.json([]);
    }

    // Verify token
    const jwt = require('jsonwebtoken');
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      // Invalid token - return empty array
      console.log('Invalid token in my-complaints:', err.message);
      return res.json([]);
    }

    const userId = String(decoded?.id || '');
    console.log('Fetching my complaints for userId:', userId);

    if (!userId) {
      return res.json([]);
    }

    const complaints = await Complaint.find({ user_id: userId }).sort({ createdAt: -1 });
    console.log('Found complaints count:', complaints.length);
    res.json(complaints);
  } catch (err) {
    console.error('Get my complaints error:', err);
    res.status(500).json({ message: 'Failed to fetch your complaints', error: err.message });
  }
});

// DEBUG: Clear all complaints
router.delete('/clear', async (req, res) => {
  try {
    const result = await Complaint.deleteMany({});
    res.json({ message: 'All complaints cleared', deletedCount: result.deletedCount });
  } catch (err) {
    console.error('Clear error:', err);
    res.status(500).json({ message: 'Failed to clear complaints', error: err.message });
  }
});

// UPVOTE
router.post('/:id/upvote', authenticateToken, async (req, res) => {
  try {
    const userId = String(req.user?.userId || '');
    if (!userId) {
      return res.status(401).json({ message: 'User authentication required' });
    }

    const complaint = await Complaint.findOneAndUpdate(
      {
        _id: req.params.id,
        supported_by: { $ne: userId },
      },
      {
        $inc: { votes: 1 },
        $addToSet: { supported_by: userId },
      },
      { new: true }
    );

    if (!complaint) {
      const exists = await Complaint.findById(req.params.id).select('_id');
      if (!exists) {
        return res.status(404).json({ message: 'Not found' });
      }
      return res.status(409).json({ message: 'You have already supported this complaint' });
    }

    res.json(complaint);
  } catch (err) {
    console.error('Upvote error:', err);
    res.status(500).json({ message: 'Failed to upvote', error: err.message });
  }
});

router.post('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status field required' });
    }

    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!complaint) {
      return res.status(404).json({ message: 'Not found' });
    }

    res.json(complaint);
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ message: 'Failed to update status', error: err.message });
  }
});

router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: 'Status field required' });
    }

    const complaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!complaint) {
      return res.status(404).json({ message: 'Not found' });
    }

    res.json(complaint);
  } catch (err) {
    console.error('Status update error:', err);
    res.status(500).json({ message: 'Failed to update status', error: err.message });
  }
});

//update COMPLAINT
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const updated = await Complaint.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE COMPLAINT
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await Complaint.findByIdAndDelete(req.params.id);

    res.json({ message: 'Complaint deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
