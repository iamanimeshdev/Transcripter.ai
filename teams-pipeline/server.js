// server.js — Express API for teams-pipeline
import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// ── Health check ──
app.get("/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
});

// ── Start a meeting bot ──
app.post("/start-meeting", (req, res) => {
    const { meetingUrl, email, meetingId } = req.body;

    if (!meetingUrl) {
        return res.status(400).json({ error: "meetingUrl is required" });
    }

    // Validate it's a Teams URL
    if (
        !meetingUrl.includes("teams.live.com") &&
        !meetingUrl.includes("teams.microsoft.com")
    ) {
        return res.status(400).json({ error: "Please provide a valid Microsoft Teams URL" });
    }

    const args = [path.join(__dirname, "teams.js"), "--url", meetingUrl];

    if (email) args.push("--email", email);
    if (meetingId) args.push("--id", meetingId);

    console.log(`🚀 Spawning bot for: ${meetingUrl} (ID: ${meetingId})`);

    const bot = spawn("node", args, {
        cwd: __dirname,
        env: { ...process.env },
        detached: true,
        stdio: "ignore",
        windowsHide: true, // Prevents cmd window on Windows
    });

    bot.unref();

    bot.on("error", (err) => {
        console.error(`❌ Bot spawn error: ${err.message}`);
    });

    bot.on("close", async (code) => {
        console.log(`✅ Bot process (ID: ${meetingId}) exited with code ${code}`);

        // Update status in frontend
        if (meetingId) {
            try {
                const status = code === 0 ? "done" : "failed";
                const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";

                await fetch(`${frontendUrl}/api/meetings/status`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ meetingId, status })
                });
                console.log(`📡 Status updated to ${status} for meeting ${meetingId}`);
            } catch (err) {
                console.error("❌ Failed to update status on frontend:", err.message);
            }
        }
    });

    res.status(201).json({
        message: "Bot is joining your meeting!",
        meetingUrl,
        meetingId,
        pid: bot.pid,
    });
});


app.listen(PORT, () => {
    console.log(`🎯 Teams pipeline server running on http://localhost:${PORT}`);
});
