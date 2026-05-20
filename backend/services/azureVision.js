const axios = require('axios');

const ALLOWED_CATEGORIES = ['road', 'water', 'electricity', 'garbage'];

const CATEGORY_KEYWORDS = {
  road: ['road', 'street', 'pothole', 'asphalt', 'sidewalk', 'footpath', 'pavement'],
  water: ['water', 'flood', 'drain', 'drainage', 'sewage', 'leak', 'pipeline'],
  electricity: ['electric', 'electricity', 'power', 'wire', 'pole', 'transformer', 'street light'],
  garbage: ['garbage', 'trash', 'waste', 'litter', 'dump', 'rubbish', 'debris'],
};

function ensureConfig() {
  const endpoint = process.env.AZURE_VISION_ENDPOINT;
  const key = process.env.AZURE_VISION_KEY;

  if (!endpoint || !key) {
    throw new Error('Azure Vision is not configured. Set AZURE_VISION_ENDPOINT and AZURE_VISION_KEY.');
  }

  return {
    endpoint: endpoint.replace(/\/+$/, ''),
    key,
  };
}

function normalizeCategory(text = '') {
  const input = String(text).toLowerCase();

  for (const category of ALLOWED_CATEGORIES) {
    if (input.includes(category)) {
      return category;
    }
  }

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((keyword) => input.includes(keyword))) {
      return category;
    }
  }

  return '';
}

async function classifyIssueImage(imageBuffer) {
  const { endpoint, key } = ensureConfig();
  const headers = {
    'Ocp-Apim-Subscription-Key': key,
    'Content-Type': 'application/octet-stream',
  };

  const attempts = [
    {
      url: `${endpoint}/computervision/imageanalysis:analyze`,
      params: {
        'api-version': '2024-02-01',
        features: 'tags,caption',
        language: 'en',
        'model-version': 'latest',
      },
      parser: (data) => ({
        captionText: data?.captionResult?.text || '',
        tags: Array.isArray(data?.tagsResult?.values) ? data.tagsResult.values : [],
      }),
    },
    {
      url: `${endpoint}/vision/v3.2/analyze`,
      params: {
        visualFeatures: 'Tags,Description',
        language: 'en',
      },
      parser: (data) => ({
        captionText: data?.description?.captions?.[0]?.text || '',
        tags: Array.isArray(data?.tags)
          ? data.tags.map((tag) => ({ name: tag.name, confidence: tag.confidence }))
          : [],
      }),
    },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    try {
      const response = await axios.post(attempt.url, imageBuffer, {
        params: attempt.params,
        headers,
        timeout: 15000,
      });

      const parsed = attempt.parser(response.data);
      const tagText = parsed.tags.map((tag) => tag.name).join(' ');
      const normalized = normalizeCategory(`${parsed.captionText} ${tagText}`);

      return {
        category: normalized,
        caption: parsed.captionText,
        tags: parsed.tags.map((tag) => ({ name: tag.name, confidence: tag.confidence })),
      };
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError?.response?.status) {
    throw new Error(`Azure request failed with status ${lastError.response.status}`);
  }
  throw new Error(lastError?.message || 'Azure request failed');
}

module.exports = {
  classifyIssueImage,
  ALLOWED_CATEGORIES,
};
