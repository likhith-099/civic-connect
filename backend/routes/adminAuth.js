const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();

const Admin = require('../models/Admin');

// REGISTER ADMIN
router.post('/register', async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      municipal_office,
      region,
    } = req.body;

    // CHECK EXISTING ADMIN
    const existingAdmin = await Admin.findOne({ email });

    if (existingAdmin) {
      return res.status(400).json({
        message: 'Admin already exists',
      });
    }

    // HASH PASSWORD
    const hashedPassword = await bcrypt.hash(password, 10);

    // CREATE ADMIN
    const admin = new Admin({
      name,
      email,
      password: hashedPassword,
      municipal_office,
      region,
    });

    await admin.save();

    // TOKEN
    const token = jwt.sign(
      {
        id: admin._id,
        role: admin.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d',
      }
    );

    res.status(201).json({
      message: 'Admin registered successfully',
      token,
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      region: admin.region,
      municipal_office: admin.municipal_office,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: 'Server error',
    });
  }
});

// LOGIN ADMIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: 'Email and password are required',
      });
    }

    // FIND ADMIN BY EMAIL
    const admin = await Admin.findOne({ email });

    if (!admin) {
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    // VERIFY PASSWORD
    const isPasswordValid = await bcrypt.compare(password, admin.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    // GENERATE TOKEN
    const token = jwt.sign(
      {
        id: admin._id,
        role: admin.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d',
      }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      region: admin.region,
      municipal_office: admin.municipal_office,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: 'Server error',
    });
  }
});

module.exports = router;