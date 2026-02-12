// modules/postProcess.js
// Save WebM → FFmpeg → WhisperX → Format → Finalize

import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { finalizeAudioTranscript } from "../utils/finalizeAudio.js";

/**
 * Save audio chunks as WebM and convert to WAV using FFmpeg.
 * @param {Buffer[]} chunks - Array of audio chunk buffers
 * @param {string} audioDir - Directory to save files in
 * @returns {string} wavPath - Path to the converted WAV file
 */
export async function saveAndConvert(chunks, audioDir) {
    if (chunks.length === 0) {
        throw new Error("No audio was captured.");
    }

    // 1. Save as WebM
    const webmPath = path.join(audioDir, "meeting_audio.webm");
    const webmBuffer = Buffer.concat(chunks);
    await fs.writeFile(webmPath, webmBuffer);
    console.log(`💾 Saved: ${webmPath} (${(webmBuffer.length / 1024 / 1024).toFixed(1)} MB)`);

    // 2. Convert WebM → WAV (16kHz mono — WhisperX requirement)
    const wavPath = path.join(audioDir, "meeting_audio.wav");
    console.log("🔄 Converting WebM → WAV...");

    await new Promise((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", [
            "-i", webmPath,
            "-ac", "1",
            "-ar", "16000",
            "-y",
            wavPath,
        ], { windowsHide: true });
        ffmpeg.stderr.on("data", () => { });
        ffmpeg.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`FFmpeg exit code ${code}`));
        });
        ffmpeg.on("error", reject);
    });

    console.log(`✅ Converted: ${wavPath}`);
    return wavPath;
}

/**
 * Transcribe a WAV file with WhisperX and return parsed segments.
 * @param {string} wavPath - Path to the WAV file
 * @returns {{ segments, language, duration }}
 */
export async function transcribeWithWhisperX(wavPath) {
    console.log("\n🎙️ Running WhisperX (CPU-only, model: small)...\n");

    const PYTHON = process.env.PYTHON_PATH || "python";
    const scriptPath = path.resolve("./scripts/transcribe.py");

    return new Promise((resolve, reject) => {
        const whisperx = spawn(PYTHON, [
            scriptPath, wavPath, "--model", "small", "--output", "json",
        ], { windowsHide: true });

        let stdout = "";

        whisperx.stdout.on("data", (data) => { stdout += data.toString(); });
        whisperx.stderr.on("data", (data) => {
            data.toString().split("\n").filter(Boolean).forEach((line) => {
                if (!line.includes("UserWarning")) console.log(`   ${line}`);
            });
        });

        whisperx.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(`WhisperX failed (exit code ${code})`));
                return;
            }

            try {
                // Robust JSON extraction
                const firstBrace = stdout.indexOf("{");
                const lastBrace = stdout.lastIndexOf("}");
                if (firstBrace === -1 || lastBrace === -1) {
                    throw new Error("No JSON object found in output");
                }
                const jsonString = stdout.substring(firstBrace, lastBrace + 1);
                const result = JSON.parse(jsonString);

                if (result.error) {
                    reject(new Error(`WhisperX error: ${result.error}`));
                    return;
                }

                resolve(result);
            } catch (e) {
                console.error("❌ Failed to parse WhisperX output:", e.message);
                if (stdout) console.log("Raw output:", stdout.substring(0, 500));
                reject(e);
            }
        });

        whisperx.on("error", (err) => {
            reject(new Error(`Failed to start WhisperX: ${err.message}`));
        });
    });
}

/**
 * Print transcript to console, format it, and run finalization (summarize + email).
 * @param {Object} result - WhisperX result { segments, language, duration }
 * @param {Object} opts - { meetingTitle, startTime }
 */
export async function printAndFinalize(result, { meetingTitle, startTime }) {
    // Print transcript to console
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

    // Build clean human-readable transcript
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

    // Finalize (Summarize + Email)
    const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
    const durationStr = `${Math.floor(elapsedSec / 60)}m ${elapsedSec % 60}s`;

    await finalizeAudioTranscript(cleanTranscript, {
        meetingTitle,
        date: new Date().toLocaleString(),
        duration: durationStr,
    });
}
