import { GoogleGenAI } from '@google/genai';

export async function extractPlacementDetails(emailBody: string, userApiKey?: string | null) {
  const apiKey = userApiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("No Gemini API key available.");
  }

  const ai = new GoogleGenAI({ apiKey });
  console.log("Analyzing email with AI...");

  const prompt = `
You are an AI assistant that reads placement and job application emails.
First, determine if the email is related to a job opportunity, placement, hiring, internship, or interview.
If it is NOT related, return a JSON object with:
- is_placement_related: false
And set all other fields to null.

If it IS related, extract the following information and return a structured JSON object:
- is_placement_related: true
- company: The name of the company.
- role: The job role (if mentioned, otherwise null).
- status: One of "Applied", "Shortlisted", "Interviewing", or "Rejected".
- summary: A concise 1-2 sentence summary of the email.

Email Content:
${emailBody}

Return ONLY valid JSON. Do NOT wrap it in markdown code blocks. Return the raw JSON object directly.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',  // Use stable model name
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    // Robust text extraction
    let text = '';
    try {
      text = response.text || '';
    } catch {
      text = response.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    if (!text) {
      throw new Error('Empty response from AI');
    }

    // Strip markdown fences that Gemini adds despite instructions
    const cleanText = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(cleanText);
    
    // Validate required fields
    if (parsed.is_placement_related === true && (!parsed.summary || typeof parsed.summary !== 'string')) {
      throw new Error('AI response missing summary field');
    }

    return parsed;
  } catch (error) {
    console.error("Error analyzing with Gemini:", error);
    return {
      is_placement_related: false,
      company: "Unknown Company",
      role: null,
      status: "Applied",
      date: null,
      time: null,
      summary: "AI Error: Check your Gemini API Key in Settings."
    };
  }
}
