#  Transcripter.ai

**AI-powered meeting transcription & summarization platform with dual-pipeline architecture.**

Transcripter.ai is a full-stack application that joins your **Google Meet** and **Microsoft Teams** meetings as a bot, captures live audio/captions, transcribes speech locally using **WhisperX**, generates professional Minutes of Meeting using **Gemini AI**, and delivers the summary via email — complete with steganographic watermarking for authenticity verification.

---

##  Features

- 🎵 **Real-Time Audio Capture (GMeet)** — Intercepts WebRTC audio streams via monkey-patched `RTCPeerConnection`, no screen recording needed
- 🗣️ **Local Speech-to-Text** — WhisperX runs entirely on-device (CPU/GPU) — your audio never leaves your machine
- 🤖 **Caption Scraping (Teams)** — Joins Teams meetings via Playwright and captures closed captions in real-time
- 📝 **AI Summarization** — Generates structured MoM (Minutes of Meeting) using Gemini AI
- 🔒 **Steganographic Watermarking** — AES-256-CBC encrypted summaries embedded into PNG images via LSB steganography
- 📧 **Email Delivery** — Sends transcript, summary, and stego image via SendGrid
- 🖥️ **Premium Dashboard** — Glassmorphism dark-themed UI with real-time meeting status tracking
- ☁️ **Deployable** — Headless Chromium for VPS deployment (no display needed)

---

##  Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Frontend (Next.js 16)              │
│         Landing Page │ Auth │ Dashboard               │
│              Vercel / localhost:3000                   │
└──────────┬───────────────────────┬────────────────────┘
           │  HTTP (fetch)         │  HTTP (fetch)
           ▼                      ▼
┌────────────────────────┐  ┌────────────────────────────┐
│   GMeet Pipeline ⭐     │  │   Teams Pipeline            │
│   (Primary / Advanced) │  │   (Express API :4000)       │
│                        │  │                             │
│  WebRTC Audio Capture  │  │  Playwright Headless Bot    │
│  ↓                     │  │  Caption Scraping (DOM)     │
│  FFmpeg → WAV (16kHz)  │  │  ↓                         │
│  ↓                     │  │  Gemini → Stego → Email    │
│  WhisperX Local STT    │  └────────────────────────────┘
│  ↓                     │
│  Gemini → Stego → Email│
└────────────────────────┘
```

### Dual Pipeline Strategy

| Pipeline | Method | Capture | Best For |
|---|---|---|---|
| **GMeet Pipeline** ⭐ | WebRTC interception → WhisperX (local STT) → Gemini | Real audio stream | Full transcription with timestamps, speaker diarization, offline-capable |
| **Teams Pipeline** | Playwright bot → caption DOM scraping → Gemini | Live captions | Lightweight, no GPU needed, deployable to any VPS |

---

## Tech Stack

### Frontend
- **Next.js 16** — React framework with App Router
- **NextAuth.js v5** — Authentication (credentials provider)
- **better-sqlite3** — Lightweight embedded database
- **bcryptjs** — Password hashing

### GMeet Pipeline (Primary)
- **Playwright** — Headless browser with persistent Chrome profile for Google login
- **WebRTC Interception** — Monkey-patches `RTCPeerConnection` to capture raw audio tracks
- **MediaRecorder** — Records intercepted audio in WebM/Opus format
- **FFmpeg** — Converts WebM → WAV (16kHz mono) for WhisperX
- **WhisperX** — Local speech-to-text with word-level timestamps (runs on CPU or GPU)
- **Gemini AI** — Generates professional Minutes of Meeting from transcript
- **SendGrid** — Email delivery with transcript + summary + stego image

### Teams Pipeline
- **Express.js 5** — API server to spawn bot processes
- **Playwright** — Headless browser automation (joins as "Transcript Bot")
- **MutationObserver** — Captures closed captions from the DOM with stability detection
- **Gemini AI** — AI summarization
- **SendGrid** — Email delivery
- **Sharp + pngjs** — Image processing & LSB steganography

---

##  Quick Start

### Prerequisites
- **Node.js** ≥ 18
- **npm** ≥ 9
- **FFmpeg** installed and on PATH (for GMeet audio conversion)
- **Python 3.10+** with WhisperX installed (for GMeet local STT)
- API keys for [Google Gemini](https://aistudio.google.com/apikey) and [SendGrid](https://sendgrid.com/)

### 1. Clone the Repository
```bash
git clone https://github.com/iamanimeshdev/Transcripter.ai.git
cd Transcripter.ai
```

### 2. Set Up the Frontend
```bash
cd frontend
npm install
```

Create `frontend/.env`:
```env
NEXTAUTH_SECRET=your-secret-key
NEXTAUTH_URL=http://localhost:3000
TEAMS_API_URL=http://localhost:4000
```

### 3. Set Up the GMeet Pipeline
```bash
cd gmeet-pipeline
npm install
npx playwright install chromium
```

Create `gmeet-pipeline/.env`:
```env
GEMINI_API_KEY=your-gemini-api-key
SENDGRID_API_KEY=your-sendgrid-api-key
EMAIL_FROM=your-verified-sender@email.com
EMAIL_TO=default-recipient@email.com
GOOGLE_EMAIL=your-google-email
GOOGLE_PASSWORD=your-google-password
PYTHON_PATH=path/to/whisperx/python
```

### 4. Set Up the Teams Pipeline
```bash
cd teams-pipeline
npm install
npx playwright install chromium
```

Create `teams-pipeline/.env`:
```env
GEMINI_API_KEY=your-gemini-api-key
SENDGRID_API_KEY=your-sendgrid-api-key
EMAIL_FROM=your-verified-sender@email.com
EMAIL_TO=default-recipient@email.com
FRONTEND_URL=http://localhost:3000
```

### 5. Run Locally
```bash
# Terminal 1 — Teams Pipeline API
cd teams-pipeline
npm start
# → 🎯 Teams pipeline server running on http://localhost:4000

# Terminal 2 — Frontend
cd frontend
npm run dev
# → http://localhost:3000
```

### 6. Use It

**Via Dashboard (Teams):**
1. Open `http://localhost:3000` → Sign up → Login
2. Click **"+ Start New Meeting"**
3. Paste your Microsoft Teams meeting URL
4. The bot joins headlessly, captures captions, and emails you the summary when the meeting ends

**Via CLI (GMeet):**
```bash
cd gmeet-pipeline
node gmeet.js --url "https://meet.google.com/xxx-xxxx-xxx"
```
The bot logs into Google, joins the meeting, captures audio via WebRTC, transcribes locally with WhisperX, and emails the summary when the meeting ends.

**Via CLI (Teams — standalone):**
```bash
cd teams-pipeline
node teams.js --url "https://teams.live.com/meet/..." --email recipient@example.com
```

---

## Security Features

- **bcrypt** password hashing with salt rounds
- **NextAuth.js** session management with JWT
- **LSB Steganography** — Meeting summaries are invisibly embedded into PNG images, providing a cryptographic watermark to verify transcript authenticity
- **Environment variables** for all API keys (never hardcoded)

---

## License

This project is built for educational and portfolio purposes.

---

<p align="center">
  Built with ❤️ using Next.js, Playwright, Gemini AI, and a lot of coffee ☕
</p>
