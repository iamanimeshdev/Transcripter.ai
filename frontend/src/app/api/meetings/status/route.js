// app/api/meetings/status/route.js — Update meeting status (internal callback)
import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function POST(req) {
    const { meetingId, status } = await req.json();

    if (!meetingId || !status) {
        return NextResponse.json({ error: "id and status required" }, { status: 400 });
    }

    try {
        db.prepare("UPDATE meetings SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(status, meetingId);

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to update meeting status:", error);
        return NextResponse.json({ error: "Database error" }, { status: 500 });
    }
}
