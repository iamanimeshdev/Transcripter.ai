// modules/audioCapture.js
// WebRTC monkey-patch + real-time chunk streaming to Node.js.

/**
 * Set up audio capture on a Playwright page.
 * Injects a WebRTC interceptor that captures incoming audio tracks,
 * records them via MediaRecorder, and streams chunks to Node.js.
 *
 * @param {Page} page - Playwright page instance
 * @returns {{ getChunks: () => Buffer[], getCount: () => number }}
 */
export async function setupAudioCapture(page) {
    const audioChunks = [];
    let chunkCount = 0;

    // Bridge: browser → Node.js
    await page.exposeFunction("sendAudioChunkToNode", (chunkArray) => {
        const buffer = Buffer.from(chunkArray);
        audioChunks.push(buffer);
        chunkCount++;
        console.log(`  🎵 Chunk ${chunkCount} received in Node.js (${buffer.length} bytes)`);
    });

    // Inject WebRTC interceptor BEFORE any page loads
    await page.addInitScript(() => {
        window.__isRecording = false;
        window.__recorder = null;
        window.__capturedTracks = [];
        window.__chunksSent = 0;

        const OriginalRTCPC = window.RTCPeerConnection;

        window.RTCPeerConnection = function (...args) {
            const pc = new OriginalRTCPC(...args);

            pc.addEventListener("track", (event) => {
                if (event.track.kind === "audio") {
                    console.log("🎵 [AudioCapture] Got audio track:", event.track.id);
                    window.__capturedTracks.push(event.track);

                    if (!window.__isRecording) {
                        startRecording();
                    }
                }
            });

            return pc;
        };
        window.RTCPeerConnection.prototype = OriginalRTCPC.prototype;
        Object.keys(OriginalRTCPC).forEach((key) => {
            try { window.RTCPeerConnection[key] = OriginalRTCPC[key]; } catch { }
        });
        if (OriginalRTCPC.generateCertificate) {
            window.RTCPeerConnection.generateCertificate = OriginalRTCPC.generateCertificate;
        }

        function startRecording() {
            try {
                const liveTracks = window.__capturedTracks.filter(
                    (t) => t.readyState === "live"
                );
                if (liveTracks.length === 0) return;

                const stream = new MediaStream(liveTracks);

                // Force Chrome to process audio
                try {
                    const audioCtx = new AudioContext({ sampleRate: 48000 });
                    const source = audioCtx.createMediaStreamSource(stream);
                    source.connect(audioCtx.destination);
                    if (audioCtx.state === "suspended") audioCtx.resume();
                } catch { }

                // Hidden audio element (belt + suspenders)
                try {
                    const audioEl = document.createElement("audio");
                    audioEl.srcObject = stream;
                    audioEl.volume = 0.01;
                    audioEl.play().catch(() => { });
                } catch { }

                // MediaRecorder → stream chunks to Node.js immediately
                let mimeType = "audio/webm;codecs=opus";
                if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = "audio/webm";

                const recorder = new MediaRecorder(stream, { mimeType });

                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) {
                        e.data.arrayBuffer().then((buf) => {
                            const arr = Array.from(new Uint8Array(buf));
                            window.sendAudioChunkToNode(arr);
                            window.__chunksSent++;
                        });
                    }
                };

                recorder.start(5000); // Every 5 seconds
                window.__recorder = recorder;
                window.__isRecording = true;
                console.log("🔴 [AudioCapture] Recording started!");
            } catch (err) {
                console.error("❌ [AudioCapture] Failed:", err);
            }
        }
    });

    // Forward browser audio capture logs to terminal
    page.on("console", (msg) => {
        if (msg.text().includes("[AudioCapture]")) {
            console.log(`  🌐 ${msg.text()}`);
        }
    });

    return {
        getChunks: () => audioChunks,
        getCount: () => chunkCount,
    };
}
