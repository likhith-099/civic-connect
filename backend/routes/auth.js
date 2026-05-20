const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/auth');

const users = [];

const issueToken = (user) =>
  jwt.sign(
    { id: user.id, role: 'user', email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

router.post('/register', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ message: 'All fields required' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = users.find((u) => u.email === normalizedEmail);
  if (existing) {
    return res.status(400).json({ message: 'Email already registered' });
  }

  const user = {
    id: Date.now().toString(),
    name: String(name).trim(),
    email: normalizedEmail,
    password: String(password),
    role: 'user',
  };

  users.push(user);
  const token = issueToken(user);

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: 'user',
    token,
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  let user = users.find((u) => u.email === normalizedEmail);

  // Dev-friendly fallback for previously created dummy users.
  if (!user) {
    user = {
      id: `u_${normalizedEmail}`,
      name: normalizedEmail.split('@')[0] || 'User',
      email: normalizedEmail,
      password: String(password),
      role: 'user',
    };
    users.push(user);
  }

  if (user.password !== String(password)) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = issueToken(user);

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: 'user',
    token,
  });
});

router.get('/me', authenticateToken, (req, res) => {
  const userId = String(req.user?.userId || '');
  const user = users.find((u) => u.id === userId);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: 'user'
  });
});

router.put('/profile', authenticateToken, (req, res) => {
  const userId = String(req.user?.userId || '');
  const user = users.find((u) => u.id === userId);

  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }

  const { name, email } = req.body;
  const updates = {};

  if (typeof name === 'string' && name.trim()) {
    updates.name = name.trim();
  }

  if (typeof email === 'string' && email.trim()) {
    const normalizedEmail = email.trim().toLowerCase();
    const conflict = users.find((u) => u.email === normalizedEmail && u.id !== user.id);
    if (conflict) {
      return res.status(400).json({ message: 'Email already in use' });
    }
    updates.email = normalizedEmail;
  }

  Object.assign(user, updates);

  return res.json({
    message: 'Profile updated successfully',
    id: user.id,
    name: user.name,
    email: user.email,
    role: 'user',
  });
});

module.exports = router;
