const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { classifyIssueImage, ALLOWED_CATEGORIES } = require('../services/azureVision');
const { generateComplaintSummary } = require('../services/huggingFace');

const router = express.Router();
const upload = multer();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const normalizeCategory = (value = '') => {
  const raw = String(value).toLowerCase().trim();

  if (ALLOWED_CATEGORIES.includes(raw)) {
    return raw;
  }

  const cleaned = raw.replace(/[^a-z\s]/g, ' ');

  if (cleaned.includes('electricity') || cleaned.includes('electric') || cleaned.includes('power')) {
    return 'electricity';
  }

  if (cleaned.includes('garbage') || cleaned.includes('trash') || cleaned.includes('waste')) {
    return 'garbage';
  }

  if (cleaned.includes('water') || cleaned.includes('drainage') || cleaned.includes('flood')) {
    return 'water';
  }

  if (cleaned.includes('road') || cleaned.includes('pothole') || cleaned.includes('street')) {
    return 'road';
  }

  return '';
};

const toTitleCase = (value = '') =>
  String(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

const isCaptionRelevantToCategory = (caption = '', category = '') => {
  const text = String(caption).toLowerCase();
  const negativeKeywords = ['person', 'people', 'man', 'woman', 'motorcycle', 'bike', 'bicycle', 'car', 'bus', 'rider'];
  if (negativeKeywords.some((word) => text.includes(word))) {
    return false;
  }

  const keywordMap = {
    road: ['pothole', 'asphalt', 'crack', 'damaged road', 'road damage', 'broken road', 'eroded road'],
    water: ['water', 'leak', 'leakage', 'drain', 'flood', 'sewage'],
    electricity: ['electric', 'wire', 'pole', 'power', 'street light', 'transformer'],
    garbage: ['garbage', 'trash', 'waste', 'litter', 'dump'],
  };

  const keywords = keywordMap[category] || [];
  return keywords.some((word) => text.includes(word));
};

const buildSuggestedTitle = (category, caption = '') => {
  const normalizedCaption = String(caption).replace(/[.]+$/, '').trim();
  if (normalizedCaption.length >= 6 && isCaptionRelevantToCategory(normalizedCaption, category)) {
    return toTitleCase(normalizedCaption);
  }

  const fallbackByCategory = {
    road: 'Pothole And Road Damage Reported',
    water: 'Water Leakage Or Drainage Issue Reported',
    electricity: 'Electricity Infrastructure Issue Reported',
    garbage: 'Garbage Accumulation Reported',
  };

  return fallbackByCategory[category] || 'Civic Issue Reported';
};

const buildSuggestions = (primaryCategory, caption = '') => {
  const ordered = [
    primaryCategory,
    ...ALLOWED_CATEGORIES.filter((item) => item !== primaryCategory),
  ].filter(Boolean);

  return ordered.slice(0, 3).map((item, index) => ({
    category: item,
    title: buildSuggestedTitle(item, index === 0 ? caption : ''),
    rank: index + 1,
  }));
};

const classifyWithGemini = async (file) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = `You are a civic issue image classifier.

Classify the uploaded image into exactly ONE category from this list:
road
water
electricity
garbage

Rules:
- Reply with ONLY one lowercase word (no explanation, no punctuation)
- If the issue is potholes, broken road, damaged street, or footpath -> "road"
- If the issue is leakage, flooding, drainage, or sewage water -> "water"
- If the issue is wires, poles, street lights, transformers, or power supply -> "electricity"
- If the issue is waste, trash, litter, or dumped material -> "garbage"`;

  const generated = await model.generateContent([
    prompt,
    {
      inlineData: {
        data: file.buffer.toString('base64'),
        mimeType: file.mimetype,
      },
    },
  ]);

  const rawText = generated.response.text();
  return normalizeCategory(rawText);
};

router.post('/classify', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    let result = null;
    let category = '';
    let source = 'azure';

    let azureReason = '';
    let geminiReason = '';

    try {
      result = await classifyIssueImage(req.file.buffer);
      category = normalizeCategory(result.category);
    } catch (azureError) {
      azureReason = azureError.message || 'Azure failed';
      console.error('Azure Vision classification error:', azureReason);
    }

    if (!category) {
      try {
        category = await classifyWithGemini(req.file);
        source = 'gemini';
      } catch (geminiError) {
        geminiReason = geminiError.message || 'Gemini failed';
        console.error('Gemini fallback classification error:', geminiReason);
      }
    }

    if (!category) {
      return res.json({
        category: null,
        classified: false,
        source: null,
        message: 'Unable to confidently classify image. Please select category manually.',
        suggestedTitle: null,
        suggestions: [],
        debug: {
          azure: azureReason || 'No match',
          gemini: geminiReason || 'No match',
        },
      });
    }

    console.log(`Classified as: ${category} (source: ${source})`);
    const suggestedTitle = buildSuggestedTitle(category, result?.caption);
    const suggestions = buildSuggestions(category, result?.caption);
    return res.json({ category, classified: true, suggestedTitle, source, suggestions });
  } catch (err) {
    console.error('Classification fatal error:', err.message);
    return res.status(500).json({ error: `Classification failed: ${err.message}` });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const {
      title,
      category,
      severity,
      priority,
      location,
      exactLocationNote,
      latitude,
      longitude,
    } = req.body;

    if (!category || !ALLOWED_CATEGORIES.includes(category.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    if (!location || location.trim().length === 0) {
      return res.status(400).json({ error: 'Location is required' });
    }

    const finalSeverity = severity || priority || 'medium';
    const text = await generateComplaintSummary({
      title,
      category,
      severity: finalSeverity,
      location,
      exactLocationNote,
      coordinates: latitude && longitude ? `${latitude}, ${longitude}` : '',
    });

    if (!text || text.length === 0) {
      return res.status(400).json({ error: 'Failed to generate description' });
    }

    console.log(`Generated Hugging Face summary for ${category}`);
    return res.json({ text });
  } catch (err) {
    console.error('Hugging Face summary error:', err.message);
    return res.status(500).json({ error: `Description generation failed: ${err.message}` });
  }
});

module.exports = router;
