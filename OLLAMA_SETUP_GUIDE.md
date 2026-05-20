# 🚀 Ollama Setup & Troubleshooting Guide

## Issue Summary
The AI complaint analysis feature requires Ollama to be running. The errors you're seeing (500 status, random output) indicate that Ollama is either:
1. **Not running** - Service not started
2. **Not accessible** - Configured URL is incorrect
3. **Missing model** - The required model (llama3.2) is not downloaded

---

## ✅ Quick Diagnostic Steps

### Step 1: Check if Ollama is Running
Open a terminal and test the Ollama API:

```powershell
# Test basic connectivity
curl http://localhost:11434/api/tags

# Expected response: {"models":[...list of models...]}
# If connection refused: Ollama is NOT running
```

### Step 2: Verify Environment Variables
Check that backend/.env has:
```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

### Step 3: Check Available Models
```powershell
# See what models are installed
curl http://localhost:11434/api/tags

# If llama3.2 is not in the list, you need to pull it
```

---

## 🔧 Installation & Setup

### Install Ollama
1. **Download from**: https://ollama.ai
2. **Run the installer** and follow prompts
3. **Start Ollama** (it runs as a background service)

### Download the Required Model
```powershell
# Pull the llama3.2 model
ollama pull llama3.2

# This will take time (1-5 minutes depending on internet speed)
# Model size: ~4.1GB
```

### Verify Model is Ready
```powershell
# List available models
ollama list

# You should see: llama3.2 (or whatever model is configured)
```

---

## 🔍 Testing the AI Service

### Test 1: Backend API Health Check
```powershell
# Start backend
cd backend
npm start

# In another terminal, test the health check endpoint
curl http://localhost:5000/api/test

# Expected: {"message":"API working"}
```

### Test 2: Analyze a Complaint
First, you need a complaint ID. Check your database:
```powershell
# Get a complaint ID from your database
# Then make a request:

curl -X POST http://localhost:5000/api/ai/analyze/COMPLAINT_ID
# Replace COMPLAINT_ID with actual ID from database
```

### Test 3: Monitor Backend Logs
The backend now logs detailed information. Look for:
- `🏥 Checking Ollama health at:` - Health check
- `✅ Ollama is healthy` - Service is running
- `❌ Ollama health check failed:` - Service not available
- `📊 Analyzing complaint` - Analysis started with complaint data
- `✅ Analysis completed` - Analysis successful

---

## 🐛 Common Issues & Solutions

### Issue: "Cannot connect to Ollama at http://localhost:11434"
**Cause**: Ollama is not running or wrong URL
**Solution**:
1. Ensure Ollama is installed and running
2. Check the configured URL in backend/.env
3. If running on different machine, update OLLAMA_URL to that machine's IP

### Issue: "Model 'llama3.2' not found"
**Cause**: Model not downloaded
**Solution**:
```powershell
ollama pull llama3.2
# Wait for download to complete
```

### Issue: "AI service error: Request timeout"
**Cause**: Model is too slow or system doesn't have enough resources
**Solution**:
- Check system CPU/RAM (needs 8GB RAM minimum)
- Use a smaller, faster model:
  ```powershell
  ollama pull phi  # Smaller, faster model (~2.7GB)
  # Then update backend/.env: OLLAMA_MODEL=phi
  ```

### Issue: Getting "random" analysis results
**Cause**: Complaint data not being passed, or model temperature too high
**Solution**:
- Check browser console logs for the complaint data being sent
- Reduce temperature in backend/services/ollamaClient.js
- Verify complaint has: title, description, category, location

---

## 📋 Data Flow Verification

The analysis flow:
1. **Frontend** → Sends complaint ID to backend
2. **Backend** → Fetches full complaint data from database
3. **Ollama Client** → Validates Ollama is running
4. **Ollama** → Analyzes complaint with system prompt & data
5. **Response** → Returns structured JSON analysis

**Check logs at each step**:
- Frontend console: `src/services/aiService.ts` logs
- Backend console: Backend route and service logs
- Database: Verify complaint record exists with all fields

---

## 🚀 Advanced: Use Faster Model

If llama3.2 is too slow on your system:

```bash
# Download a faster model
ollama pull phi          # ~2.7GB, faster
ollama pull neural-chat  # ~4.1GB, balanced

# Update backend/.env
OLLAMA_MODEL=phi

# Restart backend
```

---

## 📞 Debug Checklist

Before reporting an issue, verify:
- [ ] Ollama is installed and running
- [ ] Backend can reach Ollama (test with curl)
- [ ] Required model is downloaded (`ollama list`)
- [ ] Backend is running on port 5000
- [ ] Frontend is running on port 3000
- [ ] Complaint exists in database with title, description, category
- [ ] Browser console shows request being sent
- [ ] Backend console shows detailed logs

---

## 💡 Quick Reference

```powershell
# Start Ollama
ollama serve

# Verify running
curl http://localhost:11434/api/tags

# Download model
ollama pull llama3.2

# Test analysis (replace ID)
curl -X POST http://localhost:5000/api/ai/analyze/COMPLAINT_ID
```

---

Need more help? Check:
- Backend logs for detailed error messages
- Browser DevTools → Network tab for request/response
- `backend/.env` for configuration
