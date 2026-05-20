const axios = require('axios');
const crypto = require('crypto');

class OllamaClient {
  constructor() {
    this.baseURL = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL || 'llama3.2';
    this.isHealthy = null;
    this.lastHealthCheck = null;

    // Retry configuration
    this.retryCount = parseInt(process.env.OLLAMA_RETRY_COUNT) || 3;
    this.retryDelay = parseInt(process.env.OLLAMA_RETRY_DELAY) || 1000;

    // Cache configuration
    this.cacheTTL = parseInt(process.env.OLLAMA_CACHE_TTL) || 3600; // 1 hour
    this.responseCache = new Map();

    // Fallback models
    this.fallbackModels = (process.env.OLLAMA_FALLBACK_MODELS || '')
      .split(',')
      .map(m => m.trim())
      .filter(m => m);

    // Timeout tiers (in ms)
    this.timeouts = {
      generate: 120000,
      chat: 120000,
      embed: 30000
    };

    // Lower temperature for more consistent, focused outputs
    this.defaultOptions = {
      temperature: 0.3,  // Reduced from 0.7 for more deterministic responses
      top_p: 0.9,
      num_ctx: 4096,
    };
  }

  // Generate cache key from prompt and system
  getCacheKey(prompt, systemPrompt = '') {
    const hash = crypto.createHash('sha256');
    hash.update(prompt + '|||' + systemPrompt);
    return hash.digest('hex');
  }

  // Check if cached response is valid
  getCachedResponse(key) {
    const cached = this.responseCache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.cacheTTL * 1000) {
      this.responseCache.delete(key);
      return null;
    }

    return cached.response;
  }

  // Store response in cache
  setCacheResponse(key, response) {
    this.responseCache.set(key, {
      response,
      timestamp: Date.now()
    });
  }

  // Sleep utility for retry delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Calculate exponential backoff delay
  getBackoffDelay(attempt) {
    return this.retryDelay * Math.pow(2, attempt);
  }

  // Retry wrapper with exponential backoff
  async withRetry(fn, operationName) {
    let lastError = null;

    for (let attempt = 0; attempt < this.retryCount; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        console.log(`⚠️ ${operationName} attempt ${attempt + 1}/${this.retryCount} failed:`, error.message);

        if (attempt < this.retryCount - 1) {
          const delay = this.getBackoffDelay(attempt);
          console.log(`   Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  // Try multiple models in sequence
  async withModelFallback(fn, operationName) {
    const models = [this.model, ...this.fallbackModels];
    let lastError = null;

    for (const model of models) {
      try {
        console.log(`   Trying model: ${model}`);
        return await fn(model);
      } catch (error) {
        lastError = error;
        console.log(`⚠️ Model ${model} failed:`, error.message);
      }
    }

    throw lastError;
  }

  // Refresh health status
  async refreshHealth() {
    this.isHealthy = null;
    return await this.checkHealth();
  }

  async checkHealth() {
    // Return cached result if fresh (within 5 minutes)
    if (this.isHealthy !== null && this.lastHealthCheck) {
      const timeSinceCheck = Date.now() - this.lastHealthCheck;
      if (timeSinceCheck < 5 * 60 * 1000) {
        return this.isHealthy;
      }
    }

    try {
      console.log('Checking Ollama health at:', this.baseURL);
      const response = await axios.get(`${this.baseURL}/api/tags`, { timeout: 5000 });
      this.isHealthy = true;
      this.lastHealthCheck = Date.now();
      console.log('Ollama is healthy, available models:', response.data.models?.length || 0);
      return true;
    } catch (error) {
      this.isHealthy = false;
      this.lastHealthCheck = Date.now();
      console.error('Ollama health check failed:', error.message);
      console.error('Trying to connect to:', this.baseURL);
      return false;
    }
  }

  async generate(prompt, systemPrompt = '', options = {}) {
    const cacheKey = this.getCacheKey(prompt, systemPrompt);
    const cachedResponse = this.getCachedResponse(cacheKey);
    if (cachedResponse) {
      console.log('📦 Returning cached response for generate');
      return cachedResponse;
    }

    try {
      return await this.withRetry(async () => {
        const isHealthy = await this.checkHealth();
        if (!isHealthy) {
          throw new Error(`Ollama service not available at ${this.baseURL}. Please ensure Ollama is running.`);
        }

        console.log('Sending prompt to Ollama...');

        return await this.withModelFallback(async (model) => {
          const response = await axios.post(
            `${this.baseURL}/api/generate`,
            {
              model: model,
              prompt: systemPrompt ? `${systemPrompt}\n\nUser: ${prompt}` : prompt,
              stream: false,
              options: {
                temperature: options.temperature || 0.3,
                top_p: options.top_p || 0.9,
                ...options,
              },
            },
            { timeout: this.timeouts.generate }
          );

          console.log('Response received from Ollama, length:', response.data.response?.length || 0);

          if (!response.data.response || response.data.response.trim() === '') {
            throw new Error('Ollama returned empty response');
          }

          const result = response.data.response;

          // Cache the response
          this.setCacheResponse(cacheKey, result);
          return result;
        }, 'generate');
      }, 'Generate');
    } catch (error) {
      console.error('❌ Ollama generate failed:', error.message);
      throw new Error(`AI generation failed: ${error.message}. Ensure Ollama is running with model ${this.model}`);
    }
  }

  async chat(messages, options = {}) {
    // Create cache key from messages
    const cacheKey = this.getCacheKey(JSON.stringify(messages), '');
    const cachedResponse = this.getCachedResponse(cacheKey);
    if (cachedResponse) {
      console.log('📦 Returning cached response for chat');
      return cachedResponse;
    }

    return this.withRetry(async () => {
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        throw new Error(`Ollama service not available at ${this.baseURL}`);
      }

      console.log('Sending chat to Ollama...');

      return this.withModelFallback(async (model) => {
        const response = await axios.post(
          `${this.baseURL}/api/chat`,
          {
            model: model,
            messages,
            stream: false,
            options: {
              temperature: options.temperature || 0.7,
              ...options,
            },
          },
          { timeout: this.timeouts.chat }
        );

        console.log('Chat response received from Ollama');
        const result = response.data.message.content;

        // Cache the response
        this.setCacheResponse(cacheKey, result);
        return result;
      }, 'chat');
    }, 'Chat');
  }

  async embed(text) {
    return this.withRetry(async () => {
      const isHealthy = await this.checkHealth();
      if (!isHealthy) {
        throw new Error(`Ollama service not available at ${this.baseURL}`);
      }

      console.log('Sending embedding request to Ollama...');

      return this.withModelFallback(async (model) => {
        const response = await axios.post(
          `${this.baseURL}/api/embeddings`,
          {
            model: model,
            prompt: text,
          },
          { timeout: this.timeouts.embed }
        );

        console.log('Embedding received from Ollama');
        return response.data.embedding;
      }, 'embed');
    }, 'Embed');
  }

  // Clear cache (useful for testing or manual refresh)
  clearCache() {
    this.responseCache.clear();
    console.log('🗑️ Ollama response cache cleared');
  }
}

module.exports = new OllamaClient();