// utils/llm.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();


const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) throw new Error("GEMINI_API_KEY not set!");

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

export async function summarizeWithGemini(transcript, retries = 3) {
  const prompt = `
You are a professional Meeting Assistant. 
Analyze the following meeting transcript and generate a well-structured, professional Minutes of Meeting (MoM).

The minutes should include:
- Meeting Title
- Date & Time
- Attendees (if identifiable)
- Agenda / Purpose of the Meeting
- Key Discussion Points
- Decisions Made
- Action Items (with responsible person and deadline if mentioned)
- Next Steps / Open Issues

Use concise, professional language. 
The transcript might contain errors or noise from automated speech recognition—please use your intelligence to correct obvious errors and provide a clear, coherent summary.

Transcript:
${transcript}
  `;

  for (let i = 0; i < retries; i++) {
    try {
      const result = await model.generateContent(prompt);
      console.log(">> Received summary from Gemini.");
      return result.response.text().trim();
    } catch (error) {
      if (error.message?.includes("503") && i < retries - 1) {
        console.warn(`⚠️ Gemini busy (503), retrying in ${2 ** i}s...`);
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
}
