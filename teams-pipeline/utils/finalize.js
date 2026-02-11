// utils/finalize.js
import { summarizeWithGemini } from "./llm.js";
import { fetchRandomImage } from "./image.js";
import { embedMessageInPngBuffer } from "./stego.js";
import { sendEmail } from "./email.js";
import fs from 'fs/promises';
import path from 'path';

export async function finalizeAndProduceImage(transcript) {
  console.log("\n✅ Final transcript collected.\n");

  // STEP 0: Save transcript locally FIRST (safety measure)
  try {
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
    const transcriptDir = './transcripts';
    
    // Create transcripts directory if it doesn't exist
    try {
      await fs.mkdir(transcriptDir, { recursive: true });
    } catch (e) {
      // Directory might already exist, that's fine
    }
    
    const transcriptPath = path.join(transcriptDir, `transcript_${timestamp}.txt`);
    await fs.writeFile(transcriptPath, transcript, 'utf8');
    console.log(`💾 Transcript saved to: ${transcriptPath}\n`);
  } catch (error) {
    console.error("❌ Failed to save transcript locally:", error.message);
    console.error("⚠️  Continuing anyway...\n");
  }

  try {
    // 1. Summarize transcript
    console.log(">> Summarizing with Gemini...");
    const summaryPromise = summarizeWithGemini(transcript);
    const summary = await Promise.race([
      summaryPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Gemini API timeout')), 20000)
      )
    ]);
    console.log("✅ Gemini summary received.\n");

    // 2. Fetch random image
    console.log(">> Fetching random PNG image...");
    const imagePromise = fetchRandomImage();
    const pngBuffer = await Promise.race([
      imagePromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Image fetch timeout')), 10000)
      )
    ]);
    console.log("✅ Image fetched.\n");

    // 3. Embed summary into image (LSB stego)
    console.log(">> Embedding summary into PNG...");
    const stegoBuffer = embedMessageInPngBuffer(pngBuffer, summary);
    console.log("✅ Summary embedded.\n");

    // 4. Convert everything to base64 for SendGrid
    console.log(">> Converting to base64...");
    const stegoBase64 = stegoBuffer.toString("base64");
    const transcriptBase64 = Buffer.from(transcript, "utf8").toString("base64");
    const summaryBase64 = Buffer.from(summary, "utf8").toString("base64");
    console.log("✅ Conversion complete.\n");

    // 5. Send email entirely from memory
    console.log(">> Sending email with in-memory attachments...");
    const emailPromise = sendEmail({
      to: process.env.EMAIL_TO,
      subject: "Meeting Summary + Transcript",
      text: "Attached: stego image, transcript, and summary.",
      attachments: [
        {
          filename: "meeting_summary_stego.png",
          type: "image/png",
          disposition: "attachment",
          content: stegoBase64
        },
        {
          filename: "meeting_transcript.txt",
          type: "text/plain",
          disposition: "attachment",
          content: transcriptBase64
        },
        {
          filename: "summary.txt",
          type: "text/plain",
          disposition: "attachment",
          content: summaryBase64
        }
      ]
    });

    await Promise.race([
      emailPromise,
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Email send timeout')), 15000)
      )
    ]);

    console.log("✅ Email sent successfully with in-memory files!\n");
    
  } catch (error) {
    console.error("\n❌ Error in finalize process:");
    console.error(`   ${error.message}`);
    console.error(`   Stack: ${error.stack}\n`);
    console.error("⚠️  But don't worry - transcript was already saved locally!\n");
    
    throw error; // Re-throw so the main script knows it failed
  }
}