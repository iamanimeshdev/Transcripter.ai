"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard");
    }
  }, [status, router]);

  return (
    <div className="page-container" style={{ background: 'var(--bg-primary)', overflow: 'hidden' }}>
      {/* Header / Nav */}
      <nav className="navbar" style={{ background: 'transparent', borderBottom: 'none' }}>
        <div className="logo">Transcripter.ai</div>
        <div className="navbar-user">
          <Link href="/login" className="btn-ghost">Login</Link>
          <Link href="/signup" className="btn btn-primary" style={{ width: 'auto' }}>Get Started</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="animate-in" style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 24px',
        position: 'relative'
      }}>
        {/* Decorative mesh circle */}
        <div style={{
          position: 'absolute',
          width: '600px',
          height: '600px',
          background: 'var(--accent-glow)',
          filter: 'blur(100px)',
          borderRadius: '50%',
          zIndex: -1,
          top: '20%',
          opacity: 0.3
        }}></div>

        <h1 style={{
          fontSize: 'clamp(40px, 8vw, 72px)',
          marginBottom: '20px',
          lineHeight: 1.1,
          maxWidth: '900px'
        }}>
          Transcribe Your <span style={{ background: 'var(--gradient-1)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Meetings</span> with AI Precision
        </h1>

        <p className="subtitle" style={{
          fontSize: 'clamp(16px, 2vw, 20px)',
          maxWidth: '600px',
          marginBottom: '40px',
          lineHeight: 1.6
        }}>
          The professional minutes-of-meeting bot for Microsoft Teams.
          Capture every detail, generate summaries, and stay organized effortlessly.
        </p>

        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link href="/signup" className="btn btn-primary" style={{ width: '200px', padding: '16px' }}>
            Start Transcribing Free
          </Link>
          <Link href="/login" className="btn btn-secondary" style={{ width: '200px', padding: '16px' }}>
            View Dashboard
          </Link>
        </div>

        {/* Feature Grid */}
        <div className="animate-in-delay" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px',
          maxWidth: '1200px',
          width: '100%',
          marginTop: '100px',
          marginBottom: '80px'
        }}>
          <div className="card-glass" style={{ textAlign: 'left', padding: '32px' }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>🤖</div>
            <h3>AI Summaries</h3>
            <p className="subtitle">Powered by Gemini 1.5 for professional, accurate minutes of meeting.</p>
          </div>

          <div className="card-glass" style={{ textAlign: 'left', padding: '32px' }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>🔒</div>
            <h3>Steganographic Security</h3>
            <p className="subtitle">Unique watermarking technology to verify transcript authenticity.</p>
          </div>

          <div className="card-glass" style={{ textAlign: 'left', padding: '32px' }}>
            <div style={{ fontSize: '32px', marginBottom: '16px' }}>☁️</div>
            <h3>Cloud Storage</h3>
            <p className="subtitle">Access your meeting history and transcripts from anywhere, any time.</p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer style={{
        padding: '40px 24px',
        borderTop: '1px solid var(--border)',
        textAlign: 'center',
        color: 'var(--text-muted)',
        fontSize: '14px'
      }}>
        © 2026 Transcripter.ai. All rights reserved.
      </footer>
    </div>
  );
}
