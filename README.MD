# ResumAI - AI-Powered Resume Optimizer

An intelligent resume analysis tool built on Cloudflare Workers that uses Llama 3.3 to help job seekers optimize their resumes for ATS systems and improve match scores against job descriptions.

**Live Demo:** https://cfaichatassistant.alanmongx.workers.dev

## Features

- **Comprehensive Resume Analysis**: Scores resumes across multiple dimensions (overall match, ATS-friendliness, key skills)
- **Keyword Extraction**: Identifies matched and missing keywords from job descriptions
- **Actionable Insights**: Provides specific strengths, gaps, and improvement suggestions
- **Bullet Point Rewriting**: Automatically optimizes resume bullets with target keywords
- **Session Memory**: Tracks analysis history for comparison and iteration

## Tech Stack

- **Backend**: Cloudflare Workers (serverless)
- **AI Model**: Llama 3.3 70B via Cloudflare Workers AI
- **Storage**: Cloudflare KV for session persistence
- **Frontend**: Vanilla JavaScript + CSS

## Architecture

ResumAI implements a multi-stage workflow:

1. **Stage 1 - Analysis**: AI extracts keywords, scores resume, identifies gaps
2. **Stage 2 - Memory Storage**: Results stored in KV with 24h TTL
3. **Stage 3 - Rewriting**: Uses stored analysis to optimize bullet points
4. **Stage 4 - History**: Tracks all rewrites for comparison

## How It Works

### Analysis Workflow

```
User Input (Resume + Job Description)
        ↓
Cloudflare Worker
        ↓
Llama 3.3 Analysis (keywords, scoring, gaps)
        ↓
Store in KV (session memory)
        ↓
Display Results + Suggestions
```

### Rewriting Workflow

```
User Input (Bullet Points)
        ↓
Retrieve Missing Keywords from Analysis
        ↓
Llama 3.3 Rewrite (incorporate keywords)
        ↓
Store in KV History
        ↓
Display Optimized Bullets
```

## Deployment

### Prerequisites

- Cloudflare account
- Wrangler CLI installed

### Setup

1. Clone the repository

```bash
git clone https://github.com/alinz22/cf_ai_resumeoptimizer.git
cd cf_ai_resumeoptimizer
```

2. Create KV namespace

```bash
wrangler kv:namespace create "RESUME_MEMORY"
```

3. Add bindings in Cloudflare Dashboard:

   - Workers AI binding: `AI`
   - KV namespace binding: `RESUME_MEMORY`

4. Deploy

```bash
wrangler deploy
```

## Usage

1. Visit the deployed URL
2. Paste your resume text
3. Paste the job description
4. Click "Analyze Resume Match"
5. View scores, keywords, and suggestions
6. Use "Rewrite Bullet Points" to optimize your resume
7. Check "View History" to see past analyses

## API Endpoints

### POST /api/analyze

Analyzes resume against job description.

**Request:**

```json
{
  "resume": "string",
  "jobDescription": "string",
  "sessionId": "string (optional)"
}
```

**Response:**

```json
{
  "success": true,
  "analysis": {
    "overallScore": 85,
    "matchedKeywords": ["JavaScript", "React"],
    "missingKeywords": ["Go", "Kubernetes"],
    "strengths": ["..."],
    "gaps": ["..."],
    "suggestions": ["..."]
  },
  "sessionId": "session_xxx"
}
```

### POST /api/rewrite

Optimizes bullet points with keywords.

**Request:**

```json
{
  "bulletPoints": "string",
  "jobDescription": "string",
  "keywords": ["array"],
  "sessionId": "string"
}
```

### GET /api/history?sessionId=xxx

Retrieves session history.

## Requirements Met

✅ **LLM Integration**: Llama 3.3 70B via Workers AI  
✅ **Workflow Coordination**: Multi-stage pipeline with state management  
✅ **User Input**: Web-based text interface  
✅ **Memory/State**: KV namespace with 24h session persistence

## Why This Project

I built ResumAI to solve a real problem I face as a student job hunting. Optimizing resumes for ATS systems is time-consuming and confusing. This tool automates the process using AI to provide instant, actionable feedback.

## Contact

**Alan Mong**

- Email: alanmongx@gmail.com
- LinkedIn: [linkedin.com/in/alan-mong](https://linkedin.com/in/alan-mong)
- GitHub: [github.com/alinz22](https://github.com/alinz22)

---

Built with Cloudflare Workers AI for the Cloudflare internship application.
