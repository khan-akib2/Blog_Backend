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
          generationConfig: { temperature: 0.85, maxOutputTokens: 4096 },
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
const SYSTEM = `You are BlogHub AI, a world-class blog writer and content strategist.
Your writing style is authoritative yet conversational — like a brilliant friend who happens to be an expert.
You write with personality, depth, and genuine insight. Your content never sounds robotic or copy-pasted.

STRICT FORMATTING RULES:
- Use rich, semantic HTML only. Never use markdown (no **, no ##, no backticks).
- Structure content with <h2> and <h3> headings, <p> paragraphs, <ul>/<ol> lists, <blockquote> for key insights.
- Use <strong> to highlight critical terms and <em> for nuance or emphasis.
- Every section must feel purposeful — no filler, no generic fluff.
- Write like a human expert: use analogies, real-world examples, surprising facts, and actionable advice.
- Vary sentence length for rhythm. Mix short punchy sentences with detailed explanations.
- Never start two consecutive paragraphs the same way.`;

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

Write a gripping, deeply engaging introduction (4 paragraphs) for a blog post about: "${topic}".
${context ? `Blog context: ${context}` : ''}${historyText}

Requirements:
- Paragraph 1: Open with a surprising fact, bold statement, or vivid scenario that immediately hooks the reader. Make them feel something.
- Paragraph 2: Establish why this topic matters RIGHT NOW. Use <strong> to highlight the core problem or opportunity.
- Paragraph 3: Briefly preview what the reader will learn — make it feel like a promise worth keeping.
- Paragraph 4: A smooth transition that pulls them deeper into the article.

HTML structure to use:
<p>[Hook paragraph — surprising, vivid, emotional]</p>
<p>[Why it matters — context, stakes, <strong>key terms</strong>]</p>
<p>[What they'll learn — a compelling preview]</p>
<p>[Transition into the article body]</p>

Return ONLY the HTML. No markdown, no code fences, no extra explanation.`,

      outline: `${SYSTEM}

Create a comprehensive, well-structured blog post outline for: "${topic}".
${context ? `Context: ${context}` : ''}${historyText}

Requirements:
- 6-8 main sections covering the topic thoroughly
- Each section has a punchy, curiosity-driving <h2> title
- 3-4 bullet points per section showing what will be covered
- A brief 1-sentence teaser <p> under each <h2>
- Include an Introduction and Conclusion section

HTML structure:
<h2>[Section Title]</h2>
<p>[One-sentence teaser of what this section covers]</p>
<ul>
  <li>[Sub-point 1]</li>
  <li>[Sub-point 2]</li>
  <li>[Sub-point 3]</li>
</ul>

Return ONLY the HTML. No markdown, no code fences.`,

      paragraph: `${SYSTEM}

Write a single, expert-level paragraph for a blog post about: "${topic}".
${context ? `Context: ${context}` : ''}${historyText}

Requirements:
- 180-220 words, dense with insight
- Open with a strong topic sentence
- Include a specific example, statistic, or analogy to make it concrete
- Use <strong> for 2-3 key terms
- End with a sentence that naturally leads to the next idea
- Sound like a knowledgeable human, not a textbook

Return ONLY a single <p> tag with the content. No markdown, no code fences.`,

      section: `${SYSTEM}

Write a complete, in-depth blog section about: "${topic}".
${context ? `Context: ${context}` : ''}${historyText}

Requirements:
- A compelling <h2> heading (not generic — make it specific and interesting)
- An optional <h3> sub-heading if the section has a natural split
- 3 substantial <p> paragraphs (each 100-150 words) with real depth
- One <ul> or <ol> list with 4-6 actionable or insightful points
- Use <strong> for key terms, <em> for nuance
- Optional: one <blockquote> for a key insight or memorable takeaway
- Write with authority and personality — no fluff

Return ONLY the HTML. No markdown, no code fences.`,

      conclusion: `${SYSTEM}

Write a powerful, memorable conclusion for a blog post about: "${topic}".
${context ? `Context: ${context}` : ''}${historyText}

Requirements:
- Paragraph 1: Synthesize the key insights — don't just list them, connect them into a bigger picture
- Paragraph 2: Give the reader a clear, specific next step or call-to-action. Make it feel urgent and achievable.
- Paragraph 3: End with a thought-provoking statement, question, or inspiring line that stays with the reader

HTML structure:
<p>[Synthesis of key insights — the "so what"]</p>
<p>[Specific, actionable next step with <strong>emphasis</strong> on the most important action]</p>
<p>[Memorable closing line — inspiring, thought-provoking, or a powerful question]</p>

Return ONLY the HTML. No markdown, no code fences.`,

      faqs: `${SYSTEM}

Generate 6 insightful, specific FAQ entries for a blog post about: "${topic}".
${context ? `Context: ${context}` : ''}${historyText}

Requirements:
- Questions must be the REAL questions people actually search for — not generic
- Answers must be genuinely helpful: 3-4 sentences, specific, with practical detail
- Mix question types: how-to, why, what, comparison, common misconception
- Answers should feel like they came from an expert, not a FAQ bot

Return a JSON array ONLY — no markdown, no explanation, no code fences:
[
  {"question": "...", "answer": "..."},
  {"question": "...", "answer": "..."},
  {"question": "...", "answer": "..."},
  {"question": "...", "answer": "..."},
  {"question": "...", "answer": "..."},
  {"question": "...", "answer": "..."}
]`,

      tags: `You are an SEO expert. Generate 10 highly targeted, search-intent-driven tags for a blog post about: "${topic}".
${context ? `Context: ${context}` : ''}

Rules:
- Mix broad terms (high volume) and specific long-tail phrases (high intent)
- Use lowercase, no special characters except hyphens
- Include the main topic keyword, related subtopics, and audience-specific terms
- Return ONLY a comma-separated list. No numbers, no explanation, no extra text.`,

      chat: `${SYSTEM}

The user is writing a blog post about: "${topic}".
${context ? `Current blog content: ${context}` : ''}${historyText}

User message: ${req.body.message || topic}

Respond as a sharp, helpful blog writing partner. Be direct and specific.
If they ask for content, write it in clean HTML. If they ask a question, answer it concisely with actionable advice.
Never be vague. Always give them something they can immediately use.`,
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
