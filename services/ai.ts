import { GoogleGenAI } from '@google/genai';

export async function extractPlacementDetails(emailBody: string, userApiKey?: string | null) {
  // Use the user's API key if provided, otherwise fallback to the .env key
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

Return ONLY valid JSON. Do NOT wrap it in markdown code blocks like \`\`\`json. Return the raw JSON object directly.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const text = response.text;
    if (text) {
      return JSON.parse(text);
    }
  } catch (error) {
    console.error("Error analyzing with Gemini:", error);
  }

  // Fallback in case of error
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
