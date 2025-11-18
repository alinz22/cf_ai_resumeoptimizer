/**
 * ResumAI - AI-Powered Resume Optimization Tool
 * Features: Multi-stage workflow, persistent memory, and intelligent analysis
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Serve main application interface
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(HTML_CONTENT, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // Handle resume analysis endpoint with workflow coordination
    if (url.pathname === "/api/analyze" && request.method === "POST") {
      try {
        const { resume, jobDescription, sessionId } = await request.json();

        if (!resume || !jobDescription) {
          return Response.json(
            { error: "Both resume and job description are required" },
            { status: 400 }
          );
        }

        // Workflow Stage 1: Keyword Extraction & Analysis
        const analysis = await this.analyzeResumeMatch(
          env,
          resume,
          jobDescription
        );

        // Workflow Stage 2: Store in memory for future use
        if (sessionId) {
          await this.storeAnalysis(env, sessionId, {
            resume,
            jobDescription,
            analysis,
            timestamp: new Date().toISOString(),
          });
        }

        return Response.json({
          success: true,
          analysis,
          sessionId: sessionId || this.generateSessionId(),
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Analysis Error:", error);
        return Response.json(
          { error: "Failed to analyze resume. Please try again." },
          { status: 500 }
        );
      }
    }

    // Handle bullet point rewrite with workflow coordination
    if (url.pathname === "/api/rewrite" && request.method === "POST") {
      try {
        const { bulletPoints, jobDescription, keywords, sessionId } =
          await request.json();

        // Workflow Stage 3: Intelligent Rewriting using previous analysis
        const rewritten = await this.rewriteBulletPoints(
          env,
          bulletPoints,
          jobDescription,
          keywords
        );

        // Store rewrite results in memory
        if (sessionId) {
          await this.storeRewrite(env, sessionId, {
            original: bulletPoints,
            rewritten,
            timestamp: new Date().toISOString(),
          });
        }

        return Response.json({
          success: true,
          rewritten,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Rewrite Error:", error);
        return Response.json(
          { error: "Failed to rewrite bullet points. Please try again." },
          { status: 500 }
        );
      }
    }

    // Get analysis history (Memory retrieval)
    if (url.pathname === "/api/history" && request.method === "GET") {
      try {
        const sessionId = url.searchParams.get("sessionId");
        if (!sessionId) {
          return Response.json(
            { error: "Session ID required" },
            { status: 400 }
          );
        }

        const history = await this.getHistory(env, sessionId);
        return Response.json({
          success: true,
          history,
        });
      } catch (error) {
        console.error("History Error:", error);
        return Response.json(
          { error: "Failed to retrieve history" },
          { status: 500 }
        );
      }
    }

    return new Response("Not Found", { status: 404 });
  },

  // Workflow Stage 1: Multi-dimensional analysis
  async analyzeResumeMatch(env, resume, jobDescription) {
    const analysisPrompt = `You are an expert ATS (Applicant Tracking System) analyzer and career coach. Analyze the following resume against the job description.

RESUME:
${resume}

JOB DESCRIPTION:
${jobDescription}

Provide a comprehensive analysis in the following JSON format:
{
  "overallScore": <number 0-100>,
  "matchedKeywords": [<array of keywords from JD found in resume>],
  "missingKeywords": [<array of critical keywords from JD missing in resume>],
  "strengths": [<array of 3-4 strong points about the match>],
  "gaps": [<array of 3-4 areas where resume doesn't match JD>],
  "suggestions": [<array of 3-4 specific improvement suggestions>],
  "atsFriendliness": <number 0-100>,
  "keySkillsMatch": <number 0-100>
}

Be specific, actionable, and honest in your assessment. Focus on concrete improvements.`;

    const response = await env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [
          {
            role: "system",
            content:
              "You are an expert resume analyzer and ATS specialist. Always respond with valid JSON only, no markdown or explanations.",
          },
          { role: "user", content: analysisPrompt },
        ],
        max_tokens: 2048,
        temperature: 0.3,
      }
    );

    try {
      let jsonText = response.response.trim();
      jsonText = jsonText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      return JSON.parse(jsonText);
    } catch (e) {
      return {
        overallScore: 70,
        matchedKeywords: ["Extracted from analysis"],
        missingKeywords: ["Unable to parse full analysis"],
        strengths: ["Resume shows relevant experience"],
        gaps: ["Consider adding more specific metrics"],
        suggestions: ["Use the rewrite feature to optimize bullet points"],
        atsFriendliness: 75,
        keySkillsMatch: 70,
      };
    }
  },

  // Workflow Stage 3: Context-aware rewriting
  async rewriteBulletPoints(env, bulletPoints, jobDescription, keywords) {
    const rewritePrompt = `You are an expert resume writer specializing in ATS optimization and impactful bullet points.

JOB DESCRIPTION CONTEXT:
${jobDescription}

TARGET KEYWORDS TO INCORPORATE:
${keywords.join(", ")}

ORIGINAL BULLET POINTS:
${bulletPoints}

Rewrite these bullet points to:
1. Incorporate relevant keywords naturally from the job description
2. Use strong action verbs and quantifiable metrics
3. Highlight achievements over responsibilities
4. Maintain honesty while emphasizing relevant aspects
5. Make them ATS-friendly and recruiter-appealing

Provide your response as a JSON array of strings:
["rewritten bullet 1", "rewritten bullet 2", ...]

Only return the JSON array, nothing else.`;

    const response = await env.AI.run(
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      {
        messages: [
          {
            role: "system",
            content:
              "You are an expert resume writer. Always respond with valid JSON only.",
          },
          { role: "user", content: rewritePrompt },
        ],
        max_tokens: 1024,
        temperature: 0.4,
      }
    );

    try {
      let jsonText = response.response.trim();
      jsonText = jsonText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      return JSON.parse(jsonText);
    } catch (e) {
      return bulletPoints.split("\n").filter((b) => b.trim());
    }
  },

  // Memory Management: Store analysis
  async storeAnalysis(env, sessionId, data) {
    try {
      // Using KV for simple state storage (simpler than Durable Objects for this use case)
      // In production, you'd use Durable Objects for more complex state management
      const key = `session:${sessionId}:analysis`;
      await env.RESUME_MEMORY?.put(key, JSON.stringify(data), {
        expirationTtl: 86400, // 24 hours
      });
    } catch (e) {
      console.error("Failed to store analysis:", e);
      // Non-critical error, continue
    }
  },

  // Memory Management: Store rewrites
  async storeRewrite(env, sessionId, data) {
    try {
      const key = `session:${sessionId}:rewrite`;
      const existing = (await env.RESUME_MEMORY?.get(key, "json")) || {
        rewrites: [],
      };
      existing.rewrites.push(data);

      await env.RESUME_MEMORY?.put(key, JSON.stringify(existing), {
        expirationTtl: 86400,
      });
    } catch (e) {
      console.error("Failed to store rewrite:", e);
    }
  },

  // Memory Retrieval: Get session history
  async getHistory(env, sessionId) {
    try {
      const analysisKey = `session:${sessionId}:analysis`;
      const rewriteKey = `session:${sessionId}:rewrite`;

      const [analysis, rewrites] = await Promise.all([
        env.RESUME_MEMORY?.get(analysisKey, "json"),
        env.RESUME_MEMORY?.get(rewriteKey, "json"),
      ]);

      return {
        analysis: analysis || null,
        rewrites: rewrites?.rewrites || [],
      };
    } catch (e) {
      console.error("Failed to retrieve history:", e);
      return { analysis: null, rewrites: [] };
    }
  },

  // Utility: Generate session ID
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },
};

// Enhanced UI with Memory & State Management
const HTML_CONTENT = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ResumAI - Resume Optimizer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    
    .container {
      max-width: 1200px;
      margin: 0 auto;
    }
    
    .header {
      text-align: center;
      color: white;
      margin-bottom: 40px;
    }
    
    .header h1 {
      font-size: 48px;
      margin-bottom: 10px;
    }
    
    .header p {
      font-size: 18px;
      opacity: 0.9;
    }

    .session-info {
      background: rgba(255,255,255,0.2);
      color: white;
      padding: 10px 20px;
      border-radius: 8px;
      text-align: center;
      margin-bottom: 20px;
      font-size: 14px;
    }

    .history-btn {
      background: rgba(255,255,255,0.3);
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      margin-left: 10px;
      font-size: 13px;
    }

    .history-btn:hover {
      background: rgba(255,255,255,0.4);
    }
    
    .main-card {
      background: white;
      border-radius: 16px;
      padding: 40px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    
    .input-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-bottom: 30px;
    }
    
    .input-group {
      display: flex;
      flex-direction: column;
    }
    
    .input-group label {
      font-weight: 600;
      margin-bottom: 10px;
      color: #333;
      font-size: 16px;
    }
    
    textarea {
      padding: 15px;
      border: 2px solid #e0e0e0;
      border-radius: 12px;
      font-family: inherit;
      font-size: 14px;
      resize: vertical;
      min-height: 300px;
      transition: border-color 0.3s;
    }
    
    textarea:focus {
      outline: none;
      border-color: #667eea;
    }
    
    .analyze-btn {
      width: 100%;
      padding: 18px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 18px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    
    .analyze-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
    }
    
    .analyze-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    
    .loading {
      text-align: center;
      padding: 40px;
      display: none;
    }
    
    .loading.active {
      display: block;
    }
    
    .spinner {
      border: 4px solid #f3f3f3;
      border-top: 4px solid #667eea;
      border-radius: 50%;
      width: 50px;
      height: 50px;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .results {
      display: none;
      margin-top: 40px;
    }
    
    .results.active {
      display: block;
    }
    
    .score-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 12px;
      text-align: center;
      margin-bottom: 30px;
    }
    
    .score-value {
      font-size: 72px;
      font-weight: 700;
      margin: 10px 0;
    }
    
    .score-label {
      font-size: 18px;
      opacity: 0.9;
    }
    
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-bottom: 30px;
    }
    
    .metric-card {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 12px;
      text-align: center;
    }
    
    .metric-value {
      font-size: 36px;
      font-weight: 700;
      color: #667eea;
      margin: 10px 0;
    }
    
    .metric-label {
      font-size: 14px;
      color: #666;
      font-weight: 600;
    }
    
    .section {
      margin-bottom: 30px;
    }
    
    .section-title {
      font-size: 20px;
      font-weight: 700;
      color: #333;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    
    .keyword-list {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    
    .keyword {
      background: #e7f0ff;
      color: #667eea;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
    }
    
    .keyword.missing {
      background: #ffe7e7;
      color: #d32f2f;
    }
    
    .list-item {
      background: #f8f9fa;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 10px;
      border-left: 4px solid #667eea;
    }
    
    .list-item.gap {
      border-left-color: #ff9800;
    }
    
    .rewrite-section {
      background: #f0f7ff;
      padding: 30px;
      border-radius: 12px;
      margin-top: 30px;
    }
    
    .rewrite-input {
      width: 100%;
      min-height: 150px;
      margin-bottom: 15px;
    }
    
    .rewrite-btn {
      padding: 12px 24px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
    }
    
    .rewritten-bullets {
      margin-top: 20px;
      display: none;
    }
    
    .rewritten-bullets.active {
      display: block;
    }

    .history-modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.5);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }

    .history-modal.active {
      display: flex;
    }

    .history-content {
      background: white;
      padding: 30px;
      border-radius: 12px;
      max-width: 600px;
      max-height: 80vh;
      overflow-y: auto;
      position: relative;
    }

    .close-modal {
      position: absolute;
      top: 15px;
      right: 15px;
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #666;
    }
    
    @media (max-width: 768px) {
      .input-section {
        grid-template-columns: 1fr;
      }
      
      .metrics-grid {
        grid-template-columns: 1fr;
      }
      
      .header h1 {
        font-size: 36px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📄 ResumAI</h1>
      <p>AI-Powered Resume Optimization & ATS Analysis</p>
    </div>

    <div class="session-info" id="sessionInfo">
      <span>Session: <span id="sessionId">--</span></span>
      <button class="history-btn" id="viewHistoryBtn">📜 View History</button>
    </div>
    
    <div class="main-card">
      <div class="input-section">
        <div class="input-group">
          <label for="resume">Your Resume</label>
          <textarea 
            id="resume" 
            placeholder="Paste your resume text here...&#10;&#10;Include your experience, skills, education, and projects."
          ></textarea>
        </div>
        
        <div class="input-group">
          <label for="jobDescription">Job Description</label>
          <textarea 
            id="jobDescription" 
            placeholder="Paste the job description here...&#10;&#10;Include requirements, responsibilities, and qualifications."
          ></textarea>
        </div>
      </div>
      
      <button class="analyze-btn" id="analyzeBtn">
        🚀 Analyze Resume Match
      </button>
      
      <div class="loading" id="loading">
        <div class="spinner"></div>
        <p style="color: #666;">Running multi-stage AI analysis workflow...</p>
      </div>
      
      <div class="results" id="results">
        <div class="score-card">
          <div class="score-label">Overall Match Score</div>
          <div class="score-value" id="overallScore">--</div>
          <div class="score-label">Out of 100</div>
        </div>
        
        <div class="metrics-grid">
          <div class="metric-card">
            <div class="metric-label">ATS Friendliness</div>
            <div class="metric-value" id="atsScore">--</div>
          </div>
          <div class="metric-card">
            <div class="metric-label">Key Skills Match</div>
            <div class="metric-value" id="skillsScore">--</div>
          </div>
        </div>
        
        <div class="section">
          <div class="section-title">✅ Matched Keywords</div>
          <div class="keyword-list" id="matchedKeywords"></div>
        </div>
        
        <div class="section">
          <div class="section-title">⚠️ Missing Keywords</div>
          <div class="keyword-list" id="missingKeywords"></div>
        </div>
        
        <div class="section">
          <div class="section-title">💪 Strengths</div>
          <div id="strengths"></div>
        </div>
        
        <div class="section">
          <div class="section-title">🎯 Areas for Improvement</div>
          <div id="gaps"></div>
        </div>
        
        <div class="section">
          <div class="section-title">💡 Suggestions</div>
          <div id="suggestions"></div>
        </div>
        
        <div class="rewrite-section">
          <div class="section-title">✨ Rewrite Bullet Points</div>
          <p style="margin-bottom: 15px; color: #666;">
            Paste your bullet points below and we'll optimize them with keywords from the job description.
          </p>
          <textarea 
            class="rewrite-input" 
            id="bulletInput"
            placeholder="• Built full-stack web application&#10;• Managed team of 5 developers&#10;• Improved system performance"
          ></textarea>
          <button class="rewrite-btn" id="rewriteBtn">Optimize Bullet Points</button>
          
          <div class="rewritten-bullets" id="rewrittenBullets">
            <div class="section-title" style="margin-top: 20px;">📝 Optimized Version</div>
            <div id="rewrittenContent"></div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- History Modal -->
  <div class="history-modal" id="historyModal">
    <div class="history-content">
      <button class="close-modal" id="closeModal">&times;</button>
      <h2>Session History</h2>
      <div id="historyContent"></div>
    </div>
  </div>

  <script>
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    const rewriteBtn = document.getElementById('rewriteBtn');
    const viewHistoryBtn = document.getElementById('viewHistoryBtn');
    const historyModal = document.getElementById('historyModal');
    const closeModal = document.getElementById('closeModal');
    
    let currentAnalysis = null;
    let sessionId = localStorage.getItem('resumeai_session') || null;

    // Initialize session
    if (sessionId) {
      document.getElementById('sessionId').textContent = sessionId.substring(0, 20) + '...';
    }

    // Display session ID
    function updateSessionId(newSessionId) {
      sessionId = newSessionId;
      localStorage.setItem('resumeai_session', sessionId);
      document.getElementById('sessionId').textContent = sessionId.substring(0, 20) + '...';
    }

    analyzeBtn.addEventListener('click', async () => {
      const resume = document.getElementById('resume').value.trim();
      const jobDescription = document.getElementById('jobDescription').value.trim();
      
      if (!resume || !jobDescription) {
        alert('Please fill in both your resume and the job description.');
        return;
      }
      
      analyzeBtn.disabled = true;
      loading.classList.add('active');
      results.classList.remove('active');
      
      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ resume, jobDescription, sessionId })
        });
        
        const data = await response.json();
        
        if (data.success) {
          currentAnalysis = data.analysis;
          if (data.sessionId && !sessionId) {
            updateSessionId(data.sessionId);
          }
          displayResults(data.analysis);
        } else {
          alert('Analysis failed: ' + (data.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Error:', error);
        alert('Failed to analyze resume. Please try again.');
      } finally {
        analyzeBtn.disabled = false;
        loading.classList.remove('active');
      }
    });
    
    rewriteBtn.addEventListener('click', async () => {
      const bulletPoints = document.getElementById('bulletInput').value.trim();
      const jobDescription = document.getElementById('jobDescription').value.trim();
      
      if (!bulletPoints || !jobDescription) {
        alert('Please enter bullet points and ensure you have a job description.');
        return;
      }
      
      if (!currentAnalysis || !currentAnalysis.missingKeywords) {
        alert('Please run the analysis first to identify target keywords.');
        return;
      }
      
      rewriteBtn.disabled = true;
      rewriteBtn.textContent = 'Optimizing...';
      
      try {
        const response = await fetch('/api/rewrite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            bulletPoints, 
            jobDescription,
            keywords: currentAnalysis.missingKeywords.slice(0, 5),
            sessionId
          })
        });
        
        const data = await response.json();
        
        if (data.success) {
          displayRewrittenBullets(data.rewritten);
        } else {
          alert('Rewrite failed: ' + (data.error || 'Unknown error'));
        }
      } catch (error) {
        console.error('Error:', error);
        alert('Failed to rewrite bullet points. Please try again.');
      } finally {
        rewriteBtn.disabled = false;
        rewriteBtn.textContent = 'Optimize Bullet Points';
      }
    });

    // View history
    viewHistoryBtn.addEventListener('click', async () => {
      if (!sessionId) {
        alert('No session history available yet. Complete an analysis first!');
        return;
      }

      try {
        const response = await fetch(\`/api/history?sessionId=\${sessionId}\`);
        const data = await response.json();

        if (data.success) {
          displayHistory(data.history);
          historyModal.classList.add('active');
        } else {
          alert('Failed to load history');
        }
      } catch (error) {
        console.error('Error loading history:', error);
        alert('Failed to load history');
      }
    });

    closeModal.addEventListener('click', () => {
      historyModal.classList.remove('active');
    });

    historyModal.addEventListener('click', (e) => {
      if (e.target === historyModal) {
        historyModal.classList.remove('active');
      }
    });

    function displayHistory(history) {
      const content = document.getElementById('historyContent');
      content.innerHTML = '';

      if (history.analysis) {
        const div = document.createElement('div');
        div.style.marginTop = '20px';
        div.innerHTML = \`
          <h3>Latest Analysis</h3>
          <p><strong>Score:</strong> \${history.analysis.analysis.overallScore}/100</p>
          <p><strong>Date:</strong> \${new Date(history.analysis.timestamp).toLocaleString()}</p>
          <p><strong>Missing Keywords:</strong> \${history.analysis.analysis.missingKeywords.join(', ')}</p>
        \`;
        content.appendChild(div);
      }

      if (history.rewrites && history.rewrites.length > 0) {
        const div = document.createElement('div');
        div.style.marginTop = '20px';
        div.innerHTML = \`<h3>Rewrite History (\${history.rewrites.length})</h3>\`;
        
        history.rewrites.forEach((rewrite, idx) => {
          const rewriteDiv = document.createElement('div');
          rewriteDiv.style.marginTop = '10px';
          rewriteDiv.style.padding = '10px';
          rewriteDiv.style.background = '#f0f7ff';
          rewriteDiv.style.borderRadius = '8px';
          rewriteDiv.innerHTML = \`
            <p><strong>Rewrite #\${idx + 1}</strong></p>
            <p style="font-size: 12px; color: #666;">\${new Date(rewrite.timestamp).toLocaleString()}</p>
          \`;
          div.appendChild(rewriteDiv);
        });
        
        content.appendChild(div);
      }

      if (!history.analysis && (!history.rewrites || history.rewrites.length === 0)) {
        content.innerHTML = '<p>No history found for this session.</p>';
      }
    }
    
    function displayResults(analysis) {
      document.getElementById('overallScore').textContent = analysis.overallScore || '--';
      document.getElementById('atsScore').textContent = analysis.atsFriendliness || '--';
      document.getElementById('skillsScore').textContent = analysis.keySkillsMatch || '--';
      
      const matchedDiv = document.getElementById('matchedKeywords');
      matchedDiv.innerHTML = '';
      (analysis.matchedKeywords || []).forEach(keyword => {
        const span = document.createElement('span');
        span.className = 'keyword';
        span.textContent = keyword;
        matchedDiv.appendChild(span);
      });
      
      const missingDiv = document.getElementById('missingKeywords');
      missingDiv.innerHTML = '';
      (analysis.missingKeywords || []).forEach(keyword => {
        const span = document.createElement('span');
        span.className = 'keyword missing';
        span.textContent = keyword;
        missingDiv.appendChild(span);
      });
      
      const strengthsDiv = document.getElementById('strengths');
      strengthsDiv.innerHTML = '';
      (analysis.strengths || []).forEach(strength => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.textContent = strength;
        strengthsDiv.appendChild(div);
      });
      
      const gapsDiv = document.getElementById('gaps');
      gapsDiv.innerHTML = '';
      (analysis.gaps || []).forEach(gap => {
        const div = document.createElement('div');
        div.className = 'list-item gap';
        div.textContent = gap;
        gapsDiv.appendChild(div);
      });
      
      const suggestionsDiv = document.getElementById('suggestions');
      suggestionsDiv.innerHTML = '';
      (analysis.suggestions || []).forEach(suggestion => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.textContent = suggestion;
        suggestionsDiv.appendChild(div);
      });
      
      results.classList.add('active');
      results.scrollIntoView({ behavior: 'smooth' });
    }
    
    function displayRewrittenBullets(bullets) {
      const container = document.getElementById('rewrittenContent');
      container.innerHTML = '';
      
      bullets.forEach(bullet => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.textContent = bullet;
        container.appendChild(div);
      });
      
      document.getElementById('rewrittenBullets').classList.add('active');
    }
  </script>
</body>
</html>
`;
