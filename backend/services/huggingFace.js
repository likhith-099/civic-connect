const axios = require('axios');

function getConfig() {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  const model = process.env.HUGGINGFACE_MODEL || 'google/flan-t5-base';
  const chatModel = process.env.HUGGINGFACE_CHAT_MODEL || 'Qwen/Qwen2.5-7B-Instruct';

  if (!apiKey) {
    throw new Error('HUGGINGFACE_API_KEY is missing in backend/.env');
  }

  return { apiKey, model, chatModel };
}

function parseGeneratedText(data) {
  if (Array.isArray(data) && data.length > 0) {
    if (typeof data[0]?.generated_text === 'string') {
      return data[0].generated_text.trim();
    }
    if (typeof data[0]?.summary_text === 'string') {
      return data[0].summary_text.trim();
    }
  }

  if (typeof data?.generated_text === 'string') {
    return data.generated_text.trim();
  }

  if (typeof data?.summary_text === 'string') {
    return data.summary_text.trim();
  }

  return '';
}

function parseRouterChatText(data) {
  const text = data?.choices?.[0]?.message?.content;
  return typeof text === 'string' ? text.trim() : '';
}

function formatErrorDetail(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw?.error === 'string') return raw.error;
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function polishSummary(text) {
  let output = String(text || '').trim();
  output = output.replace(/\s+/g, ' ');
  output = output.replace(/\bseverity:\s*([a-z]+)/i, (_, level) => `Severity: ${level.toLowerCase()}.`);
  if (!/[.?!]$/.test(output)) {
    output += '.';
  }
  return output;
}

async function generateViaRouterChat(apiKey, chatModel, prompt) {
  const response = await axios.post(
    'https://router.huggingface.co/v1/chat/completions',
    {
      model: `${chatModel}:cheapest`,
      messages: [
        {
          role: 'system',
          content:
            'You write professional civic complaint summaries for municipal officials. Use neutral formal tone, specific facts only, 2-3 complete sentences, and clear action-oriented wording.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.4,
      max_tokens: 160,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  const text = parseRouterChatText(response.data);
  if (!text) {
    throw new Error('Router chat returned empty summary');
  }
  return polishSummary(text);
}

async function generateComplaintSummary(details) {
  const { apiKey, model, chatModel } = getConfig();
  const encodedModel = encodeURIComponent(model);
  const endpoints = [
    `https://api-inference.huggingface.co/models/${encodedModel}`,
    `https://api-inference.huggingface.co/pipeline/text2text-generation/${encodedModel}`,
    `https://api-inference.huggingface.co/pipeline/summarization/${encodedModel}`,
    `https://router.huggingface.co/hf-inference/models/${encodedModel}`,
  ];

  const prompt = `Write a professional municipal complaint summary in exactly 2 or 3 sentences.
Title: ${details.title || 'Not provided'}
Category: ${details.category}
Severity: ${details.severity}
Location: ${details.location}
Exact spot details: ${details.exactLocationNote || 'Not provided'}
Coordinates: ${details.coordinates || 'Not provided'}
Requirements:
- Formal and objective tone
- Mention public safety or service impact
- Mention severity and precise location context
- No greeting, no sign-off
- Do not invent facts`;

  let lastError = null;
  for (const url of endpoints) {
    try {
      const response = await axios.post(
        url,
        {
          inputs: prompt,
          parameters: {
            max_new_tokens: 120,
            temperature: 0.4,
            return_full_text: false,
          },
          options: {
            wait_for_model: true,
          },
        },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const text = parseGeneratedText(response.data);
      if (text) {
        return polishSummary(text);
      }
    } catch (error) {
      lastError = error;
    }
  }

  const hfProviderError = String(formatErrorDetail(lastError?.response?.data)).toLowerCase();
  if (hfProviderError.includes('not supported by provider hf-inference')) {
    try {
      return await generateViaRouterChat(apiKey, chatModel, prompt);
    } catch (routerError) {
      lastError = routerError;
    }
  }

  const status = lastError?.response?.status;
  const detail =
    formatErrorDetail(lastError?.response?.data) ||
    lastError?.message ||
    'Unknown error';
  throw new Error(`Hugging Face request failed${status ? ` (${status})` : ''}: ${detail}`);
}

module.exports = { generateComplaintSummary };
