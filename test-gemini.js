require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const API_KEY = process.env.GEMINI_API_KEY;

async function test() {
  if (!API_KEY) {
    console.error('❌ FAILED: No GEMINI_API_KEY in .env');
    return;
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });
  
  try {
    console.log('Testing gemini-2.0-flash...');
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: 'Say hello in JSON format with a "message" field.',
      config: { responseMimeType: 'application/json' },
    });
    
    console.log('✅ SUCCESS');
    console.log('Raw response:', response.text);
  } catch (err) {
    console.error('❌ FAILED');
    console.error('Error name:', err.name);
    console.error('Error message:', err.message);
    console.error('Full error:', err);
  }
}

test();
