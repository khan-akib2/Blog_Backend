const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');

const MODELS = [
  'gemini-flash-lite-latest',
  'gemini-flash-latest',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash',
];

async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set in server .env');

  let lastError = '';
  for (const model of MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 2048 },
        }),
      }
    );
    const data = await res.json();
    if (!res.ok) {
      lastError = data?.error?.message || `HTTP ${res.status}`;
      console.warn(`[AI] ${model} failed: ${lastError.substring(0, 80)}`);
      continue;
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) { console.log(`[AI] OK with ${model}`); return text; }
    lastError = 'Empty response';
  }
  throw new Error(lastError || 'All models failed');
}

// ── System persona ────────────────────────────────────────────────────────────
const SYSTEM = `You are BlogHub AI, an expert blog writing assistant. 
You write in a professional, engaging, and modern style.
Always use proper HTML formatting with headings, paragraphs, bold text, and lists where appropriate.
Make content feel like it was written by a knowledgeable human expert, not a robot.
Be detailed, insightful, and add real value to the reader.`;

// ── POST /api/ai/generate ─────────────────────────────────────────────────────
router.post('/generate', protect, async (req, res) => {
  try {
    const { type, topic, context, history = [] } = req.body;
    if (!topic?.trim()) return res.status(400).json({ success: false, message: 'topic is required' });

    // Build conversation context from history
    const historyText = history.length > 0
      ? '\n\nPrevious conversation:\n' + history.map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.content.substring(0, 200)}`).join('\n')
      : '';

    const prompts = {
      intro: `${SYSTEM}

Write a compelling, detailed introduction (3-4 paragraphs) for a blog post about: "${topic}".
${context ? `Blog context: ${context}` : ''}${historyText}

Format as HTML with:
- An engaging opening <p> that hooks the reader
- 2-3 more <p> tags building context and importance
- Use <strong> for key terms
- End with a transition sentence

Return ONLY the HTML content, no markdown, no code blocks.`,

      outline: `${SYSTEM}

Create a comprehensive, detailed blog post outline for: "${topic}".
${context ? `Context: ${context}` : ''}${historyText}

Format as HTML:
- Use <h2> for main sections (5-7 sections)
- Use <ul><li> for sub-points under each section (2-3 per section)
- Add a brief <p> description after each <h2>
- Include an intro section and conclusion section

Return ONLY the HTML content, no markdown, no code blocks.`,

      paragraph: `${SYSTEM}

Write a detailed, expert-level paragraph for a blog post about: "${topic}".
${context ? `Context: ${context}` : ''}${historyText}

Format as HTML:
- One well-structured <p> tag (150-200 words)
- Use <strong> for important terms
- Be specific, add facts or examples where relevant

Return ONLY the HTML content, no markdown, no code blocks.`,

      section: `${SYSTEM}

Write a complete blog section with heading and content about: "${topic}".
${context ? `Context: ${context}` : ''}${historyText}

Format as HTML:
- Start with <h2> heading
- 2-3 <p> paragraphs of detailed content
- Add a <ul> list if relevant
- Use <strong> for key terms

Return ONLY the HTML content, no markdown, no code blocks.`,

      conclusion: `${SYSTEM}

Write a powerful conclusion for a blog post about: "${topic}".
${context ? `Context: ${context}` : ''}${historyText}

Format as HTML:
- Opening <p> summarizing key takeaways
- Middle <p> with actionable advice or insights
- Closing <p> with a strong call-to-action
- Use <strong> for emphasis

Return ONLY the HTML content, no markdown, no code blocks.`,

      faqs: `${SYSTEM}

Generate 5 detailed FAQ entries for a blog post about: "${topic}".
${context ? `Context: ${context}` : ''}${historyText}

Return a JSON array ONLY (no markdown, no explanation):
[
  {"question": "...", "answer": "..."},
  {"question": "...", "answer": "..."},
  {"question": "...", "answer": "..."},
  {"question": "...", "answer": "..."},
  {"question": "...", "answer": "..."}
]

Make questions specific and answers detailed (2-3 sentences each).`,

      tags: `Generate 10 highly relevant SEO tags for a blog post about: "${topic}".
${context ? `Context: ${context}` : ''}

Return ONLY a comma-separated list of single words or short 2-word phrases. No numbers, no explanation.`,

      chat: `${SYSTEM}

The user is writing a blog post about: "${topic}".
${context ? `Current blog content summary: ${context}` : ''}${historyText}

User message: ${req.body.message || topic}

Respond helpfully as a blog writing assistant. If they ask for content, provide it in HTML format.
Keep response concise and actionable.`,
    };

    const prompt = prompts[type] || prompts.chat;
    let text = await callGemini(prompt);

    // For FAQs, parse JSON
    if (type === 'faqs') {
      try {
        // Strip markdown code blocks if present
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const faqs = JSON.parse(text);
        return res.json({ success: true, faqs, type });
      } catch {
        // Fallback: return as text
        return res.json({ success: true, text, type });
      }
    }

    // Clean up any accidental markdown code blocks
    text = text.replace(/^```html\n?/i, '').replace(/^```\n?/, '').replace(/```$/, '').trim();

    res.json({ success: true, text, type });
  } catch (err) {
    console.error('[AI] Error:', err.message);
    res.status(502).json({ success: false, message: err.message });
  }
});

module.exports = router;
