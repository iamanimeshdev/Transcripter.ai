// app/api/meetings/route.js — Create + List meetings
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

const TEAMS_API_URL = process.env.TEAMS_API_URL || "http://localhost:4000";

// GET — List meetings for the logged-in user
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const meetings = db
        .prepare(
            "SELECT * FROM meetings WHERE user_id = ? ORDER BY created_at DESC"
        )
        .all(session.user.id);

    return NextResponse.json({ meetings });
}

// POST — Submit a new meeting for transcription
export async function POST(req) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { meetingUrl } = await req.json();

    if (
        !meetingUrl ||
        !(meetingUrl.includes("teams.live.com") || meetingUrl.includes("teams.microsoft.com"))
    ) {
        return NextResponse.json(
            { error: "Please provide a valid Microsoft Teams URL" },
            { status: 400 }
        );
    }

    // Insert meeting record
    const result = db
        .prepare(
            "INSERT INTO meetings (user_id, meeting_url, status) VALUES (?, ?, 'recording')"
        )
        .run(session.user.id, meetingUrl);

    const meetingId = result.lastInsertRowid;

    // Call the teams-pipeline Express server
    try {
        const apiRes = await fetch(`${TEAMS_API_URL}/start-meeting`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                meetingUrl,
                email: session.user.email,
                meetingId: meetingId,
            }),
        });

        if (!apiRes.ok) {
            const errData = await apiRes.json().catch(() => ({}));
            throw new Error(errData.error || `Pipeline responded with ${apiRes.status}`);
        }
    } catch (error) {
        // Update meeting status to failed
        db.prepare("UPDATE meetings SET status = 'failed' WHERE id = ?").run(meetingId);
        return NextResponse.json(
            { error: `Failed to start bot: ${error.message}` },
            { status: 502 }
        );
    }

    return NextResponse.json(
        {
            message: "Bot is joining your meeting!",
            meetingId,
            status: "recording",
        },
        { status: 201 }
    );
}

