import { GoogleGenAI } from '@google/genai';

export async function extractPlacementDetails(emailBody: string) {
  // Initialize the Gemini client using the API key from .env
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  console.log("Analyzing email with AI...");
  
  const prompt = `
You are an AI assistant that reads placement and job application emails.
Extract the following information from the email and return it as a structured JSON object:
- company: The name of the company.
- role: The job role (if mentioned, otherwise null).
- status: One of "Applied", "Shortlisted", "Interviewing", or "Rejected".
- date: The date of any upcoming interview/event in YYYY-MM-DD format (if mentioned, otherwise null).
- time: The time of any upcoming interview/event (if mentioned, otherwise null).
- summary: A concise 1-2 sentence summary of the email.

Email Content:
${emailBody}

Return ONLY valid JSON.
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
    company: "Unknown Company",
    role: null,
    status: "Applied",
    date: null,
    time: null,
    summary: "Could not extract details due to an AI error."
  };
}
