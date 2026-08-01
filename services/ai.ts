import { GoogleGenAI } from '@google/genai';
import ollama from 'ollama';
import OpenAI from 'openai';

// ── Lazy Provider Clients ──
let _openrouter: OpenAI | null = null;
function getOpenRouter() {
  if (!_openrouter) {
    _openrouter = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY || 'sk-dummy',
      defaultHeaders: {
        'HTTP-Referer': process.env.NEXTAUTH_URL || 'http://localhost:3000',
        'X-Title': 'Placement Opportunity Tracker',
      },
    });
  }
  return _openrouter;
}

let _groq: OpenAI | null = null;
function getGroq() {
  if (!_groq) {
    _groq = new OpenAI({
      baseURL: 'https://api.groq.com/openai/v1',
      apiKey: process.env.GROQ_API_KEY || 'sk-dummy',
    });
  }
  return _groq;
}

// ── Types ──
export interface ExtractedDetails {
  is_placement_related: boolean;
  company: string | null;
  role: string | null;
  status: string;
  summary: string;
}

export type AIProvider = 'ollama' | 'openrouter' | 'groq' | 'gemini' | 'auto';

// ── Prompt Builder ──
function buildPrompt(emailBody: string): string {
  return `You are an AI assistant that reads placement and job application emails.
First, determine if the email is related to a job opportunity, placement, hiring, internship, or interview.
If it is NOT related, return ONLY this exact JSON:
{"is_placement_related":false,"company":null,"role":null,"status":null,"summary":null}

If it IS related, extract the following and return ONLY this exact JSON:
{"is_placement_related":true,"company":"Company Name","role":"Job Role","status":"Shortlisted","summary":"1-2 sentence summary"}

Status MUST be exactly one of: Applied, Shortlisted, Interviewing, Rejected.
Do NOT add markdown fences. Do NOT add explanations. Return raw JSON only.

Email Content:
${emailBody.substring(0, 4000)}`;
}

// ── Ollama Provider ──
async function tryOllama(emailBody: string): Promise<ExtractedDetails> {
  const response = await ollama.chat({
    model: 'phi4-mini',
    messages: [{ role: 'user', content: buildPrompt(emailBody) }],
    format: 'json',
    options: { temperature: 0, num_predict: 256 },
  });
  
  return parseAndValidate(response.message.content, 'ollama');
}

// ── Groq Provider ──
async function tryGroq(emailBody: string): Promise<ExtractedDetails> {
  const response = await getGroq().chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: buildPrompt(emailBody) }],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 256,
  });
  
  const text = response.choices[0].message.content || '';
  return parseAndValidate(text, 'groq');
}

// ── OpenRouter Provider ──
async function tryOpenRouter(emailBody: string): Promise<ExtractedDetails> {
  const response = await getOpenRouter().chat.completions.create({
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    messages: [{ role: 'user', content: buildPrompt(emailBody) }],
    response_format: { type: 'json_object' },
    temperature: 0,
    max_tokens: 256,
  });
  
  const text = response.choices[0].message.content || '';
  return parseAndValidate(text, 'openrouter');
}

// ── Gemini Provider ──
async function tryGemini(emailBody: string, apiKey: string): Promise<ExtractedDetails> {
  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: buildPrompt(emailBody),
    config: { responseMimeType: 'application/json' },
  });
  
  let text = '';
  try {
    text = response.text || '';
  } catch {
    text = (response as any).candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  
  return parseAndValidate(text, 'gemini');
}

// ── Parse & Validate ──
function parseAndValidate(text: string, source: string): ExtractedDetails {
  if (!text) throw new Error(`Empty response from ${source}`);
  
  const cleanText = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  
  const parsed = JSON.parse(cleanText);
  
  if (parsed.is_placement_related !== true) {
    return {
      is_placement_related: false,
      company: null,
      role: null,
      status: 'Applied',
      summary: 'Not a placement email.',
    };
  }
  
  const validStatuses = ['Applied', 'Shortlisted', 'Interviewing', 'Rejected'];
  const normalizedStatus = parsed.status
    ? parsed.status.charAt(0).toUpperCase() + parsed.status.slice(1).toLowerCase()
    : 'Applied';
  
  return {
    is_placement_related: true,
    company: parsed.company || 'Unknown Company',
    role: parsed.role || null,
    status: validStatuses.includes(normalizedStatus) ? normalizedStatus : 'Applied',
    summary: parsed.summary || 'No summary available.',
  };
}

// ── Health Checks ──
export async function isOllamaRunning(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 800);
    const res = await fetch('http://localhost:11434', { 
      method: 'HEAD', 
      signal: controller.signal 
    });
    clearTimeout(timeout);
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

export async function checkProviderHealth(): Promise<Record<string, boolean>> {
  const health: Record<string, boolean> = {
    ollama: false,
    groq: false,
    openrouter: false,
    gemini: false,
  };
  
  health.ollama = await isOllamaRunning();
  
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}` }
    });
    health.groq = res.ok;
  } catch { health.groq = false; }
  
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { 
      headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}` }
    });
    health.openrouter = res.ok;
  } catch { health.openrouter = false; }
  
  health.gemini = !!(process.env.GEMINI_API_KEY);
  
  return health;
}

// ── Main Cascade Router ──
export async function extractPlacementDetails(
  emailBody: string,
  options?: {
    preferredProvider?: AIProvider;
    userGeminiKey?: string | null;
  }
): Promise<ExtractedDetails & { _provider: string }> {
  
  const { preferredProvider, userGeminiKey } = options || {};
  const errors: string[] = [];
  
  // If user explicitly prefers a provider, try it first
  if (preferredProvider && preferredProvider !== 'auto') {
    try {
      if (preferredProvider === 'ollama' && await isOllamaRunning()) {
        return { ...(await tryOllama(emailBody)), _provider: 'ollama' };
      }
      if (preferredProvider === 'groq') {
        return { ...(await tryGroq(emailBody)), _provider: 'groq' };
      }
      if (preferredProvider === 'openrouter') {
        return { ...(await tryOpenRouter(emailBody)), _provider: 'openrouter' };
      }
      if (preferredProvider === 'gemini' && userGeminiKey) {
        return { ...(await tryGemini(emailBody, userGeminiKey)), _provider: 'gemini' };
      }
    } catch (e) {
      errors.push(`${preferredProvider} failed: ${(e as Error).message}`);
    }
  }
  
  // CASCADE: Auto-detect best available provider
  // 1. Ollama (unlimited, fastest for Apple Silicon)
  if (await isOllamaRunning()) {
    try {
      return { ...(await tryOllama(emailBody)), _provider: 'ollama' };
    } catch (e) {
      errors.push(`ollama: ${(e as Error).message}`);
    }
  }
  
  // 2. Groq (1,000/day, 320+ tok/s, most generous free tier)
  if (process.env.GROQ_API_KEY) {
    try {
      return { ...(await tryGroq(emailBody)), _provider: 'groq' };
    } catch (e) {
      errors.push(`groq: ${(e as Error).message}`);
    }
  }
  
  // 3. OpenRouter (50-1,000/day, broad model choice)
  if (process.env.OPENROUTER_API_KEY) {
    try {
      return { ...(await tryOpenRouter(emailBody)), _provider: 'openrouter' };
    } catch (e) {
      errors.push(`openrouter: ${(e as Error).message}`);
    }
  }
  
  // 4. User's own Gemini key
  if (userGeminiKey) {
    try {
      return { ...(await tryGemini(emailBody, userGeminiKey)), _provider: 'gemini' };
    } catch (e) {
      errors.push(`gemini-user: ${(e as Error).message}`);
    }
  }
  
  // 5. App-level Gemini key
  if (process.env.GEMINI_API_KEY) {
    try {
      return { ...(await tryGemini(emailBody, process.env.GEMINI_API_KEY)), _provider: 'gemini' };
    } catch (e) {
      errors.push(`gemini-env: ${(e as Error).message}`);
    }
  }
  
  console.error('All AI providers failed:', errors);
  return {
    is_placement_related: false,
    company: 'Unknown Company',
    role: null,
    status: 'Applied',
    summary: `AI Error: All providers unavailable. ${errors[0] || 'Check your connection or add an API key in Settings.'}`,
    _provider: 'none',
  };
}
