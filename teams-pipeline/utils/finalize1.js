// utils/finalize.js
import { summarizeWithGemini } from "./llm.js";
import { fetchRandomImage } from "./image.js";
import { embedMessageInPngBuffer } from "./stego.js";
import { sendEmail } from "./email.js";

export async function finalizeAndProduceImage(transcript) {
  console.log("\n Final transcript collected.\n");

  // 1. Summarize transcript
  console.log(">> Summarizing with Gemini...");
  const summary = await summarizeWithGemini(transcript);
  console.log(" Gemini summary received.\n");

  // 2. Fetch random image
  console.log(">> Fetching random PNG image...");
  const pngBuffer = await fetchRandomImage();

  // 3. Embed summary into image (LSB stego)
  // console.log(">> Embedding summary into PNG...");
  // const stegoBuffer = embedMessageInPngBuffer(pngBuffer, summary);

  // 4. Convert everything to base64 for SendGrid
  const stegoBase64 = pngBuffer.toString("base64");
  const transcriptBase64 = Buffer.from(transcript, "utf8").toString("base64");
  const summaryBase64 = Buffer.from(summary, "utf8").toString("base64");

  // 5. Send email entirely from memory
  console.log(">> Sending email with in-memory attachments...");
  await sendEmail({
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

  console.log(" Email sent successfully with in-memory files!");
}
