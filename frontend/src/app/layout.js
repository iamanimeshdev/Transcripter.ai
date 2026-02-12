// app/layout.js
import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "Transcripter.ai — AI Meeting Transcription",
  description:
    "Automatically transcribe and summarize your Google Meet meetings with AI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

