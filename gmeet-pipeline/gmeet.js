// gmeet.js — Thin orchestrator for the GMeet audio transcription pipeline
// Usage: node gmeet.js --url https://meet.google.com/xxx-xxxx-xxx

import path from "path";
import fs from "fs/promises";
import dotenv from "dotenv";
dotenv.config();

import { launchBrowser } from "./modules/browser.js";
import { setupAudioCapture } from "./modules/audioCapture.js";
import { loginToGoogle, joinMeeting, waitForMeetingEnd } from "./modules/meetingFlow.js";
import { saveAndConvert, transcribeWithWhisperX, printAndFinalize } from "./modules/postProcess.js";

// ── Parse CLI args ──
const meetUrl = process.argv.find((a, i) => process.argv[i - 1] === "--url")
  || process.env.MEET_URL
  || null;

if (!meetUrl) {
  console.error("❌ Usage: node gmeet.js --url https://meet.google.com/xxx-xxxx-xxx");
  process.exit(1);
}

console.log(`\n🚀 GMeet Transcription Bot`);
console.log(`   Meeting: ${meetUrl}\n`);

// ── Main pipeline ──
(async () => {
  const meetingId = `meeting_${Date.now()}`;
  const audioDir = path.resolve(`./audio_chunks/${meetingId}`);
  await fs.mkdir(audioDir, { recursive: true });

  const startTime = Date.now();

  // 1. Launch browser
  const { context, page } = await launchBrowser();

  // 2. Setup audio capture (WebRTC interception)
  const audio = await setupAudioCapture(page);

  // 3. Login to Google (one-time, uses persistent profile)
  await loginToGoogle(page);

  // 4. Join the meeting
  const meetingTitle = await joinMeeting(page, meetUrl);

  // 5. Status updates every 20s
  const statusInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const totalBytes = audio.getChunks().reduce((sum, b) => sum + b.length, 0);
    const mb = (totalBytes / 1024 / 1024).toFixed(1);
    console.log(`\n🔴 Status: ${elapsed}s | ${audio.getCount()} chunks | ${mb} MB captured`);
  }, 20000);

  // 6. Wait for meeting to end
  await waitForMeetingEnd(page);
  clearInterval(statusInterval);

  // 7. Post-process: Save → Convert → Transcribe → Summarize → Email
  console.log(`\n🛑 Stopping...`);
  console.log(`📦 ${audio.getCount()} audio chunks in Node.js memory\n`);

  if (audio.getChunks().length === 0) {
    console.log("⚠️ No audio was captured.");
    try { await context.close(); } catch { }
    process.exit(0);
  }

  try {
    const wavPath = await saveAndConvert(audio.getChunks(), audioDir);
    const result = await transcribeWithWhisperX(wavPath);
    await printAndFinalize(result, { meetingTitle, startTime });
  } catch (err) {
    console.error(`\n❌ Pipeline error: ${err.message}`);
  }

  console.log(`\n📁 Audio files: ${audioDir}`);
  try { await context.close(); } catch { }
  process.exit(0);
})();

// ── Graceful shutdown ──
process.on("SIGINT", () => {
  console.log("\n\n⚠️ Ctrl+C — data is safe in Node.js memory. Exiting...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  process.exit(0);
});