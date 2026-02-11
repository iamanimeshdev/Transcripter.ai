// utils/finalizeAudio.js
// Audio-specific finalization - parallel to finalize.js

import { summarizeWithGemini } from "./llm.js";
import { sendEmail } from "./email.js";
import { fetchRandomImage } from "./image.js";
import { embedMessageInPngBuffer } from "./stego.js";
import fs from "fs/promises";
import path from "path";

/**
 * Finalize audio transcript: summarize, embed in image, and email
 * 
 * @param {string} transcript - Plain text transcript from WhisperX
 * @param {Object} metadata - Meeting metadata
 */
export async function finalizeAudioTranscript(transcript, metadata = {}) {
    console.log("\n🎵 Finalizing audio transcript...\n");

    // STEP 0: Save transcript locally (safety measure)
    try {
        const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
        const transcriptDir = "./transcripts";
        await fs.mkdir(transcriptDir, { recursive: true });

        const transcriptPath = path.join(transcriptDir, `audio_transcript_${timestamp}.txt`);
        await fs.writeFile(transcriptPath, transcript, "utf8");
        console.log(`💾 Audio transcript saved to: ${transcriptPath}\n`);
    } catch (error) {
        console.error("❌ Failed to save audio transcript locally:", error.message);
    }

    try {
        // 1. Summarize transcript
        console.log(">> Summarizing audio transcript with Gemini...");
        const summary = await summarizeWithGemini(transcript);
        console.log("✅ Audio summary received.\n");

        // 2. Fetch image and embed summary (Premium Feature)
        console.log(">> Generating meeting summary image...");
        let stegoBase64 = null;
        try {
            const pngBuffer = await fetchRandomImage();
            const stegoBuffer = embedMessageInPngBuffer(pngBuffer, summary);
            stegoBase64 = stegoBuffer.toString("base64");
            console.log("✅ Summary embedded in image.\n");
        } catch (imgErr) {
            console.error("⚠️ Image generation failed, skipping stego:", imgErr.message);
        }

        // 3. Prepare email content
        const meetingTitle = metadata.meetingTitle || "Meeting";
        const meetingDate = metadata.date || new Date().toLocaleString();
        const duration = metadata.duration || "Unknown";

        const emailBody = `
🎵 AUDIO-BASED TRANSCRIPT

This transcript was generated from meeting audio using WhisperX.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MEETING DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title: ${meetingTitle}
Date: ${meetingDate}
Duration: ${duration}
Source: WhisperX Audio Transcription

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${summary}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📎 Full audio transcript and summary image attached.
`.trim();

        // 4. Send email
        console.log(">> Sending audio transcript email...");

        const attachments = [
            {
                filename: "audio_transcript.txt",
                type: "text/plain",
                content: Buffer.from(transcript, "utf8").toString("base64"),
            },
            {
                filename: "summary.txt",
                type: "text/plain",
                content: Buffer.from(summary, "utf8").toString("base64"),
            }
        ];

        if (stegoBase64) {
            attachments.push({
                filename: "meeting_summary_image.png",
                type: "image/png",
                content: stegoBase64,
            });
        }

        await sendEmail({
            to: process.env.EMAIL_TO,
            subject: `🎵 [Audio] Meeting Summary - ${meetingTitle}`,
            text: emailBody,
            attachments
        });

        console.log("✅ Audio transcript email sent successfully!\n");

        return { success: true, summary };

    } catch (error) {
        console.error("\n❌ Error in audio finalize process:", error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Simplified version that just saves locally (for when email fails repeatedly)
 */
export async function saveAudioTranscriptLocally(transcript, metadata = {}) {
    const timestamp = new Date().toISOString().replace(/:/g, "-").split(".")[0];
    const transcriptDir = "./transcripts";

    await fs.mkdir(transcriptDir, { recursive: true });

    const data = {
        transcript,
        metadata,
        savedAt: new Date().toISOString(),
    };

    const jsonPath = path.join(transcriptDir, `audio_transcript_${timestamp}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2), "utf8");

    console.log(`💾 Audio transcript saved locally: ${jsonPath}`);
    return jsonPath;
}
