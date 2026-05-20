require('dotenv').config();
const connectDB = require('./config/db');
connectDB();

const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());

const adminAuthRoutes = require('./routes/adminAuth');
app.use('/api/admin', adminAuthRoutes);

const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

const complaintRoutes = require('./routes/complaints');
app.use('/api/complaints', complaintRoutes);

const imageAiRoutes = require('./routes/ai');
app.use('/api/ai', imageAiRoutes);

const aiRoutes = require('./routes/ai.routes');
app.use('/api/ai-admin', aiRoutes);

// test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'API working' });
});

// start server
app.listen(5000, () => {
  console.log('Server running on http://localhost:5000');
});

console.log("All routes loaded successfully");
