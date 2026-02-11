import { chromium } from "playwright";
import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { finalizeAudioTranscript } from "./utils/finalizeAudio.js";
dotenv.config();

/* ─────────────────────────────
   MAIN — Audio-only GMeet pipeline
   Join meeting → capture tab audio via WebRTC → WhisperX → print transcript

   Audio chunks stream to Node.js in real-time (safe from browser crashes/Ctrl+C).
   Stops when meeting ends ("You've left the meeting") or browser closes.
   ───────────────────────────── */
(async () => {
  const meetingId = `meeting_${Date.now()}`;
  const audioDir = path.resolve(`./audio_chunks/${meetingId}`);
  await fs.mkdir(audioDir, { recursive: true });

  let meetingTitle = "Google Meet";
  const startTime = Date.now();

  // ── Audio data stored in Node.js memory (not browser) ──
  const audioChunksInNode = [];
  let chunkCount = 0;

  const context = await chromium.launchPersistentContext(
    "./chrome-profile",
    {
      headless: false,
      channel: "chrome",
      viewport: null,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--start-maximized",
        "--autoplay-policy=no-user-gesture-required",
        "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream",
        "--disable-features=AudioServiceOutOfProcess",
      ],
    }
  );

  const page = await context.newPage();
  page.setDefaultTimeout(0);

  // ── Expose function so browser can stream audio chunks to Node.js ──
  await page.exposeFunction("sendAudioChunkToNode", (chunkArray) => {
    const buffer = Buffer.from(chunkArray);
    audioChunksInNode.push(buffer);
    chunkCount++;
    console.log(`  🎵 Chunk ${chunkCount} received in Node.js (${buffer.length} bytes)`);
  });

  /* ─────────────────────────────
     Inject WebRTC audio interceptor BEFORE any page loads
     Captures incoming audio tracks → MediaRecorder → streams to Node.js
     ───────────────────────────── */
  await page.addInitScript(() => {
    window.__isRecording = false;
    window.__recorder = null;
    window.__capturedTracks = [];
    window.__chunksSent = 0;

    const OriginalRTCPC = window.RTCPeerConnection;

    window.RTCPeerConnection = function (...args) {
      const pc = new OriginalRTCPC(...args);

      pc.addEventListener("track", (event) => {
        if (event.track.kind === "audio") {
          console.log("🎵 [AudioCapture] Got audio track:", event.track.id);
          window.__capturedTracks.push(event.track);

          if (!window.__isRecording) {
            startRecording();
          }
        }
      });

      return pc;
    };
    window.RTCPeerConnection.prototype = OriginalRTCPC.prototype;
    Object.keys(OriginalRTCPC).forEach((key) => {
      try { window.RTCPeerConnection[key] = OriginalRTCPC[key]; } catch { }
    });
    if (OriginalRTCPC.generateCertificate) {
      window.RTCPeerConnection.generateCertificate = OriginalRTCPC.generateCertificate;
    }

    function startRecording() {
      try {
        const liveTracks = window.__capturedTracks.filter(
          (t) => t.readyState === "live"
        );
        if (liveTracks.length === 0) return;

        const stream = new MediaStream(liveTracks);

        // Force Chrome to process audio
        try {
          const audioCtx = new AudioContext({ sampleRate: 48000 });
          const source = audioCtx.createMediaStreamSource(stream);
          source.connect(audioCtx.destination);
          if (audioCtx.state === "suspended") audioCtx.resume();
        } catch { }

        // Hidden audio element (belt + suspenders)
        try {
          const audioEl = document.createElement("audio");
          audioEl.srcObject = stream;
          audioEl.volume = 0.01;
          audioEl.play().catch(() => { });
        } catch { }

        // MediaRecorder → stream chunks to Node.js immediately
        let mimeType = "audio/webm;codecs=opus";
        if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "audio/webm";

        const recorder = new MediaRecorder(stream, { mimeType });

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            e.data.arrayBuffer().then((buf) => {
              // Send to Node.js immediately (not stored in browser)
              const arr = Array.from(new Uint8Array(buf));
              window.sendAudioChunkToNode(arr);
              window.__chunksSent++;
            });
          }
        };

        recorder.start(5000); // Every 5 seconds
        window.__recorder = recorder;
        window.__isRecording = true;
        console.log("🔴 [AudioCapture] Recording started!");
      } catch (err) {
        console.error("❌ [AudioCapture] Failed:", err);
      }
    }
  });

  // Forward browser audio capture logs to terminal
  page.on("console", (msg) => {
    if (msg.text().includes("[AudioCapture]")) {
      console.log(`  🌐 ${msg.text()}`);
    }
  });

  console.log("🌐 Opening Google login page...");
  await page.goto("https://accounts.google.com");

  console.log(`
==================================================
👉 MANUAL STEP (ONE TIME ONLY)
==================================================
Log into Google fully and stay logged in.
==================================================
`);

  await page.waitForSelector(
    'img[alt*="Google Account"], a[href*="SignOutOptions"]',
    { timeout: 0 }
  );
  console.log("✅ Logged in");

  console.log("🎥 Opening Google Meet...");
  await page.goto("https://meet.google.com/wci-zrnj-ccm");

  try {
    await page.waitForSelector('div[data-meeting-title], h1', { timeout: 10000 });
    meetingTitle = await page.evaluate(() => {
      const el = document.querySelector('div[data-meeting-title]');
      if (el) return el.getAttribute('data-meeting-title');
      const h1 = document.querySelector('h1');
      return h1 ? h1.innerText : "Google Meet";
    });
    console.log(`📌 Meeting Title: ${meetingTitle}`);
  } catch {
    console.log("📌 Could not capture meeting title, using default.");
  }

  await page.waitForSelector(
    'button span:has-text("Join now"), button span:has-text("Ask to join")',
    { timeout: 60000 }
  );

  // Disable mic
  try {
    const mic = page.locator('button[aria-label*="microphone"]').first();
    if (await mic.count()) {
      await mic.click();
      console.log("🎤 Microphone disabled");
    }
  } catch { }

  // Disable cam
  try {
    const cam = page.locator('button[aria-label*="camera"]').first();
    if (await cam.count()) {
      await cam.click();
      console.log("📹 Camera disabled");
    }
  } catch { }

  console.log("🚪 Joining meeting...");
  await page.click(
    'button span:has-text("Join now"), button span:has-text("Ask to join"),button span:has-text("Switch here")'
  );

  await page.waitForTimeout(8000);
  console.log("✅ Joined meeting\n");

  /* ─────────────────────────────
     Status updates every 20s
     ───────────────────────────── */
  const statusInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const totalBytes = audioChunksInNode.reduce((sum, b) => sum + b.length, 0);
    const mb = (totalBytes / 1024 / 1024).toFixed(1);
    console.log(`\n🔴 Status: ${elapsed}s | ${chunkCount} chunks in Node.js | ${mb} MB captured`);
  }, 20000);

  /* ─────────────────────────────
     FINISH: Save → Convert → Transcribe
     All audio data is already in Node.js memory — safe from page crashes!
     ───────────────────────────── */
  let isFinishing = false;

  async function finish() {
    if (isFinishing) return;
    isFinishing = true;
    clearInterval(statusInterval);

    console.log("\n🛑 Stopping...");
    console.log(`📦 ${chunkCount} audio chunks already in Node.js memory\n`);

    if (audioChunksInNode.length === 0) {
      console.log("⚠️ No audio was captured.");
      try { await context.close(); } catch { }
      process.exit(0);
    }

    // 1. Save as WebM
    const webmPath = path.join(audioDir, "meeting_audio.webm");
    const webmBuffer = Buffer.concat(audioChunksInNode);
    await fs.writeFile(webmPath, webmBuffer);
    console.log(`💾 Saved: ${webmPath} (${(webmBuffer.length / 1024 / 1024).toFixed(1)} MB)`);

    // 2. Convert WebM → WAV
    const wavPath = path.join(audioDir, "meeting_audio.wav");
    console.log("🔄 Converting WebM → WAV...");

    try {
      await new Promise((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", [
          "-i", webmPath,
          "-ac", "1",
          "-ar", "16000",
          "-y",
          wavPath,
        ]);
        ffmpeg.stderr.on("data", () => { });
        ffmpeg.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`FFmpeg exit code ${code}`));
        });
        ffmpeg.on("error", reject);
      });
      console.log(`✅ Converted: ${wavPath}`);
    } catch (err) {
      console.error("❌ FFmpeg conversion failed:", err.message);
      console.log(`📁 Raw WebM file saved at: ${webmPath}`);
      try { await context.close(); } catch { }
      process.exit(1);
    }

    // 3. Transcribe with WhisperX
    console.log("\n🎙️ Running WhisperX (CPU-only, model: small)...\n");

    const PYTHON = process.env.PYTHON_PATH || "python";
    const scriptPath = path.resolve("./scripts/transcribe.py");

    await new Promise((resolve) => {
      const whisperx = spawn(PYTHON, [
        scriptPath, wavPath, "--model", "small", "--output", "json",
      ]);

      let stdout = "";

      whisperx.stdout.on("data", (data) => { stdout += data.toString(); });
      whisperx.stderr.on("data", (data) => {
        data.toString().split("\n").filter(Boolean).forEach((line) => {
          if (!line.includes("UserWarning")) console.log(`   ${line}`);
        });
      });

      whisperx.on("close", async (code) => {
        if (code !== 0) {
          console.error(`\n❌ WhisperX failed (exit code ${code})`);
          resolve();
          return;
        }

        try {
          // Robust JSON extraction: look for the first '{' and last '}' 
          // to skip any log messages that leaked to stdout
          const firstBrace = stdout.indexOf("{");
          const lastBrace = stdout.lastIndexOf("}");

          if (firstBrace === -1 || lastBrace === -1) {
            throw new Error("No JSON object found in output");
          }

          const jsonString = stdout.substring(firstBrace, lastBrace + 1);
          const result = JSON.parse(jsonString);

          if (result.error) {
            console.error(`\n❌ WhisperX error: ${result.error}`);
            resolve();
            return;
          }

          console.log("\n" + "═".repeat(60));
          console.log("  📝 WHISPERX TRANSCRIPT");
          console.log("═".repeat(60) + "\n");

          if (result.segments && result.segments.length > 0) {
            for (const seg of result.segments) {
              const start = seg.start?.toFixed(1) || "?";
              const end = seg.end?.toFixed(1) || "?";
              console.log(`[${start}s → ${end}s]  ${seg.text}`);
            }
          } else {
            console.log("  (No speech detected)");
          }

          console.log("\n" + "═".repeat(60));
          console.log(`  Language: ${result.language}`);
          console.log(`  Duration: ${result.duration}s`);
          console.log(`  Segments: ${result.segments?.length || 0}`);
          console.log("═".repeat(60));

          // 4. Create a clean human-readable transcript for the user/AI
          let cleanTranscript = "";
          if (result.segments && result.segments.length > 0) {
            cleanTranscript = result.segments
              .map(seg => {
                const start = seg.start?.toFixed(1) || "?";
                const end = seg.end?.toFixed(1) || "?";
                return `[${start.padStart(6)}s → ${end.padStart(6)}s]  ${seg.text.trim()}`;
              })
              .join("\n");
          } else {
            cleanTranscript = "(No speech detected)";
          }

          // 5. Finalize (Summarize + Email)
          const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
          const durationStr = `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`;

          await finalizeAudioTranscript(cleanTranscript, {
            meetingTitle,
            date: new Date().toLocaleString(),
            duration: durationStr
          });
        } catch (e) {
          console.error("❌ Failed to parse WhisperX output:", e.message);
          if (stdout) console.log("Raw output:", stdout.substring(0, 500));
        }
        resolve();
      });

      whisperx.on("error", (err) => {
        console.error("❌ Failed to start WhisperX:", err.message);
        resolve();
      });
    });

    console.log(`\n📁 Audio files: ${audioDir}`);
    try { await context.close(); } catch { }
    process.exit(0);
  }

  /* ─────────────────────────────
     Detect meeting end: "You've left the meeting" or "You were removed"
     ───────────────────────────── */
  console.log("👂 Recording meeting audio...");
  console.log("   Bot will stop automatically when the meeting ends.\n");

  // Poll for meeting-end indicators
  const meetingEndPoll = setInterval(async () => {
    try {
      const meetingEnded = await page.evaluate(() => {
        const body = document.body?.innerText || "";
        return (
          body.includes("You've left the meeting") ||
          body.includes("You left the meeting") ||
          body.includes("The meeting has ended") ||
          body.includes("You were removed") ||
          body.includes("Return to home screen")
        );
      });

      if (meetingEnded) {
        clearInterval(meetingEndPoll);
        console.log("\n📞 Meeting ended detected!");
        await finish();
      }
    } catch {
      // Page might have closed — that's a meeting end too
      clearInterval(meetingEndPoll);
      console.log("\n� Browser closed — treating as meeting end");
      await finish();
    }
  }, 5000);

  // Also handle browser/page close
  page.on("close", () => {
    clearInterval(meetingEndPoll);
    finish();
  });

  // Ctrl+C still works as a backup (data is already in Node.js!)
  process.on("SIGINT", async () => {
    clearInterval(meetingEndPoll);
    console.log("\n\n⚠️ Ctrl+C received — data is safe in Node.js, finishing...");
    await finish();
  });

  process.on("SIGTERM", async () => {
    clearInterval(meetingEndPoll);
    await finish();
  });
})();