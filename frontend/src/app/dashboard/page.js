"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useCallback } from "react";

export default function DashboardPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [meetings, setMeetings] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [meetUrl, setMeetUrl] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitMsg, setSubmitMsg] = useState("");
    const [error, setError] = useState("");

    const fetchMeetings = useCallback(async () => {
        try {
            const res = await fetch("/api/meetings");
            if (res.ok) {
                const data = await res.json();
                setMeetings(data.meetings || []);
            }
        } catch {
            // silent
        }
    }, []);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        }
        if (status === "authenticated") {
            fetchMeetings();
            // Poll for status updates every 15s
            const interval = setInterval(fetchMeetings, 15000);
            return () => clearInterval(interval);
        }
    }, [status, router, fetchMeetings]);

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");
        setSubmitMsg("");
        setSubmitting(true);

        try {
            const res = await fetch("/api/meetings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ meetingUrl: meetUrl }),
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || "Failed to start bot");
                setSubmitting(false);
                return;
            }

            setSubmitMsg("🤖 Bot is joining your meeting!");
            setMeetUrl("");
            fetchMeetings();

            setTimeout(() => {
                setShowModal(false);
                setSubmitMsg("");
            }, 2000);
        } catch {
            setError("Network error");
        }
        setSubmitting(false);
    }

    function getBadgeClass(status) {
        switch (status) {
            case "recording": return "badge badge-recording";
            case "done": return "badge badge-done";
            case "failed": return "badge badge-failed";
            default: return "badge badge-pending";
        }
    }

    function formatDate(dateStr) {
        if (!dateStr) return "";
        return new Date(dateStr).toLocaleString();
    }

    const totalMeetings = meetings.length;
    const recordingCount = meetings.filter((m) => m.status === "recording").length;
    const doneCount = meetings.filter((m) => m.status === "done").length;

    if (status === "loading") {
        return (
            <div className="auth-container">
                <div className="logo" style={{ animation: "pulse 2s infinite" }}>
                    Transcripter.ai
                </div>
            </div>
        );
    }

    return (
        <div className="page-container">
            {/* Navbar */}
            <nav className="navbar">
                <div className="logo">Transcripter.ai</div>
                <div className="navbar-user">
                    <div className="user-email">{session?.user?.email}</div>
                    <button
                        className="btn-ghost"
                        onClick={() => signOut({ callbackUrl: "/login" })}
                        style={{ border: '1px solid var(--border)', marginLeft: '12px' }}
                    >
                        Sign Out
                    </button>
                </div>
            </nav>

            {/* Dashboard */}
            <div className="dashboard animate-in">
                <div className="dashboard-header" style={{ alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>
                            Hello, {session?.user?.name?.split(" ")[0] || "there"}!
                        </h1>
                        <p className="subtitle" style={{ fontSize: '16px' }}>You have {meetings.length} meeting records today.</p>
                    </div>
                    <button
                        className="btn btn-primary"
                        style={{ width: "auto", padding: '14px 28px', fontSize: '15px' }}
                        onClick={() => setShowModal(true)}
                    >
                        + Start New Meeting
                    </button>
                </div>

                {/* Stats */}
                <div className="stats-row animate-in-delay">

                    <div className="stat-card">
                        <div className="stat-value">{totalMeetings}</div>
                        <div className="stat-label">Total Meetings</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{ color: "var(--recording)" }}>
                            {recordingCount}
                        </div>
                        <div className="stat-label">Recording</div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-value" style={{ color: "var(--success)" }}>
                            {doneCount}
                        </div>
                        <div className="stat-label">Completed</div>
                    </div>
                </div>

                {/* Meeting list */}
                <h2 style={{ marginBottom: "16px" }}>Recent Meetings</h2>

                {meetings.length === 0 ? (
                    <div className="empty-state animate-in-delay">
                        <div className="empty-state-icon">🎙️</div>
                        <h2 style={{ color: "var(--text-primary)" }}>No meetings yet</h2>
                        <p>
                            Click &ldquo;New Meeting&rdquo; to start transcribing your first
                            meeting!
                        </p>
                    </div>
                ) : (
                    <div className="meetings-list animate-in-delay">
                        {meetings.map((m, i) => (
                            <div key={m.id} className="card-glass meeting-card" style={{ animationDelay: `${i * 0.1}s` }}>
                                <div className="meeting-info">
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                        <div className="meeting-title">
                                            {m.title || "Teams Meeting"}
                                        </div>
                                    </div>
                                    <div className="meeting-url">{m.meeting_url}</div>
                                    <div className="meeting-date">
                                        📅 {formatDate(m.created_at)}
                                        {m.duration && ` • 🕒 ${m.duration}`}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <span className={getBadgeClass(m.status)}>
                                        {m.status}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

            </div>

            {/* New Meeting Modal */}
            {showModal && (
                <div
                    className="modal-overlay"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setShowModal(false);
                    }}
                >
                    <div className="modal">
                        <h2>Start New Transcription</h2>
                        <p className="subtitle mb-24">
                            Paste your Microsoft Teams link and our bot will join to
                            transcribe.
                        </p>

                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label htmlFor="meetUrl">Teams Meeting URL</label>
                                <input
                                    id="meetUrl"
                                    type="url"
                                    placeholder="https://teams.live.com/meet/..."
                                    value={meetUrl}
                                    onChange={(e) => setMeetUrl(e.target.value)}
                                    required
                                />
                            </div>

                            {error && <p className="error-text">{error}</p>}
                            {submitMsg && <p className="success-text">{submitMsg}</p>}

                            <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => setShowModal(false)}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    disabled={submitting}
                                >
                                    {submitting ? "Starting..." : "🤖 Start Bot"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
