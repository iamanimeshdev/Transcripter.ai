// utils/llm.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();


const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) throw new Error("GEMINI_API_KEY not set!");

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

export async function summarizeWithGemini(transcript) {
  const prompt = `
You are a professional Minutes of Meeting (MoM) taker.
Analyze the following meeting transcript(Transcript is the captions so it might be noisy and error-prone so correct it too) and generate well-structured Minutes of Meeting.
Context: this meeting is about sales and target achieved and need to be completed in a pharmaceutical company.
The minutes should include:

Meeting Title

Date & Time (if mentioned)

Attendees (if mentioned)

Agenda / Purpose of the Meeting

Key Discussion Points (summarized clearly)

Decisions Made

Action Items

Task

Responsible Person

Deadline (if mentioned)

Open Issues / Follow-ups

Next Meeting Details (if mentioned)

Use concise, professional language.
Do not copy the transcript verbatim—summarize and organize the content clearly.
If any information is missing, infer cautiously or mark it as “Not specified.”

Transcript:
${transcript}
  `;

  const result = await model.generateContent(prompt);
  console.log(">> Received summary from Gemini.");
  console.log(result.response.text().trim());
  return result.response.text().trim();
}
