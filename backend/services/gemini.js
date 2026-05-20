const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 🔹 Image → category
exports.classifyImage = async (file) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-pro-vision' });

  const result = await model.generateContent([
    {
      inlineData: {
        data: file.buffer.toString('base64'),
        mimeType: file.mimetype,
      },
    },
    'Classify this civic issue into one word: road, water, electricity, garbage',
  ]);

  const text = result.response.text().toLowerCase();

  return { category: text.trim() };
};

// 🔹 Text generation
exports.generateDescription = async ({ category, location, priority }) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

  const prompt = `
  Write a formal complaint to municipal authorities.

  Category: ${category}
  Location: ${location}
  Priority: ${priority}

  Tone: professional, concise
  `;

  const result = await model.generateContent(prompt);
  return result.response.text();
};