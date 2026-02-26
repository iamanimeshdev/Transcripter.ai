# Transcripter.ai

Transcripter.ai is an AI-powered meeting transcription platform that automatically transcribes and summarizes your Microsoft Teams meetings. It uses advanced AI models to capture every detail and generate professional meeting minutes.

## Features

- **AI-Powered Transcription**: Automatically transcribes Microsoft Teams meetings with high accuracy
- **AI Summaries**: Generates professional meeting summaries using Gemini 1.5
- **Steganographic Security**: Unique watermarking technology to verify transcript authenticity
- **Cloud Storage**: Access your meeting history and transcripts from anywhere
- **Real-time Processing**: Meetings are processed and made available quickly
- **User Authentication**: Secure login system with credential-based authentication
- **Dashboard Interface**: Clean, modern dashboard to manage your meetings

## Architecture

This project consists of multiple components:

### Frontend (Next.js)
- **Framework**: Next.js 16 with React 19
- **Database**: SQLite with better-sqlite3
- **Authentication**: NextAuth.js with credential provider
- **Styling**: Custom CSS with dark theme and glassmorphism effects

### Backend Services
- **Teams Pipeline**: Node.js service that joins Teams meetings and processes audio
- **Google Meet Pipeline**: Node.js service for Google Meet transcription
- **Steganography Tools**: HTML pages for encoding/decoding hidden messages in PNG images

### Key Technologies
- **AI Models**: Gemini 1.5 for summarization
- **Audio Processing**: FFmpeg for audio capture and processing
- **Encryption**: AES encryption for secure data handling
- **Database**: SQLite for user data and meeting records

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- FFmpeg (for audio processing)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/iamanimeshdev/Transcripter.ai.git
   cd Transcripter.ai
   ```

2. **Install dependencies**
   ```bash
   # Frontend
   cd frontend
   npm install
   
   # Teams pipeline
   cd ../teams-pipeline
   npm install
   
   # Google Meet pipeline
   cd ../gmeet-pipeline
   npm install
   ```

3. **Set up environment variables**
   Create a `.env.local` file in the frontend directory:
   ```
   NEXTAUTH_SECRET=your-secret-key
   NEXTAUTH_URL=http://localhost:3000
   TEAMS_API_URL=http://localhost:4000
   ```

4. **Initialize the database**
   ```bash
   cd frontend
   node -e "require('./src/lib/db').init()"
   ```

### Running the Application

1. **Start the frontend**
   ```bash
   cd frontend
   npm run dev
   ```
   This starts the Next.js development server on `http://localhost:3000`

2. **Start the Teams pipeline**
   ```bash
   cd teams-pipeline
   npm start
   ```
   This starts the Teams bot server on `http://localhost:4000`

3. **Start the Google Meet pipeline (optional)**
   ```bash
   cd gmeet-pipeline
   npm start
   ```
   This starts the Google Meet bot server on `http://localhost:4001`

## Usage

1. **Register an account**
   - Visit `http://localhost:3000/signup`
   - Create a new account with your email and password

2. **Login**
   - Visit `http://localhost:3000/login`
   - Enter your credentials

3. **Start a meeting transcription**
   - Go to the dashboard at `http://localhost:3000/dashboard`
   - Click "+ Start New Meeting"
   - Paste your Microsoft Teams meeting URL
   - The bot will join and start transcribing

4. **View results**
   - Once the meeting is complete, the transcript will be available in your dashboard
   - AI-generated summaries will be provided

## Security Features

### Steganography
The project includes steganography tools for secure message encoding:

- **Encoder**: `encoder.html` - Encode hidden messages in PNG images
- **Decoder**: `stegno.html` - Decode hidden messages from PNG images

These tools use AES encryption combined with LSB (Least Significant Bit) steganography for secure message hiding.

### Data Protection
- All user passwords are hashed using bcrypt
- Meeting data is stored securely in SQLite
- API endpoints are protected with authentication

## Project Structure

```
Transcripter.ai/
├── frontend/                    # Next.js application
│   ├── src/
│   │   ├── app/               # Next.js App Router pages
│   │   ├── lib/              # Utilities and database
│   │   └── public/           # Static assets
│   ├── package.json
│   └── next.config.mjs
├── teams-pipeline/            # Microsoft Teams bot service
├── gmeet-pipeline/            # Google Meet bot service
├── encoder.html               # Steganography encoder
├── stegno.html                # Steganography decoder
└── README.md                 # This file
```

## API Endpoints

### Frontend API
- `GET /api/meetings` - List user's meetings
- `POST /api/meetings` - Create new meeting
- `POST /api/meetings/status` - Update meeting status
- `POST /api/signup` - User registration
- `POST /api/auth/[...nextauth]` - Authentication

### Teams Pipeline API
- `POST /start-meeting` - Start Teams meeting transcription

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For issues and questions, please open an issue on the GitHub repository.

---

**Transcripter.ai** - Making meeting transcription effortless with AI