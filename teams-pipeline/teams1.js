// teams_bot.js
import { chromium } from "playwright";
import { finalizeAndProduceImage } from "./utils/finalize1.js";
import dotenv from "dotenv";
dotenv.config();


(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-features=ExternalProtocolDialog",
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream"
    ]
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(0);

  console.log(">> Opening meeting...");
  await page.goto("https://teams.live.com/meet/9318098754618?p=kAZCY5dBjOBOfmMsQS&&webjoin=true");

  await page.waitForSelector('input[type="text"]');
  await page.fill('input[type="text"]', "Transcript Bot");

  try { await page.getByRole("radio", { name: /Don't use audio/i }).check(); } catch {}

  await page.click('button:has-text("Join now")');
  await page.waitForSelector('[data-cid="call-screen-wrapper"]');

  console.log("✅ Joined meeting.");

  // Enable captions
  try {
    await page.locator('#callingButtons-showMoreBtn').click();
    await page.getByRole("menuitem", { name: /Captions/i }).click();
  } catch {
    console.log("⚠️ Could not auto-enable captions.");
  }

  // Transcript logic
  let transcript = "";
  let recording = true;
  let lastCaption = Date.now();

  await page.exposeFunction("onNewCaption", (author, caption) => {
    lastCaption = Date.now();

    const lower = caption.toLowerCase();
    if (lower.includes("stop recording")) {
      console.log("⛔ Stop command received.");
      finish();
      return;
    }

    if (recording) {
      const line = `${author}: ${caption}`;
      transcript += line + "\n";
      console.log(line);
    }
  });

  // Improved mutation observer with better stability detection
  await page.evaluate(() => {
    const captionTrackers = new Map();
    
    function trackCaption(captionEl, authorEl) {
      // Create unique identifier for this caption element
      const id = Math.random().toString(36);
      
      let lastText = captionEl.innerText;
      let stableCount = 0;
      const requiredStableChecks = 3; // Must be stable for 3 consecutive checks
      const checkInterval = 800; // Increased from 500ms
      
      const tracker = {
        author: authorEl?.innerText.trim() || "Unknown",
        element: captionEl,
        interval: setInterval(() => {
          const currentText = captionEl.innerText.trim();
          
          // Check if text has changed
          if (currentText === lastText && currentText.length > 0) {
            stableCount++;
            
            // Only capture after multiple stable checks
            if (stableCount >= requiredStableChecks) {
              clearInterval(tracker.interval);
              captionTrackers.delete(id);
              
              // Final check: ensure element still exists and hasn't been replaced
              if (document.body.contains(captionEl)) {
                window.onNewCaption(tracker.author, currentText);
              }
            }
          } else {
            // Text changed, reset stability counter
            stableCount = 0;
            lastText = currentText;
          }
          
          // Safety: clear after 10 seconds regardless
          if (Date.now() - tracker.startTime > 10000) {
            clearInterval(tracker.interval);
            captionTrackers.delete(id);
            if (currentText.length > 0 && document.body.contains(captionEl)) {
              window.onNewCaption(tracker.author, currentText);
            }
          }
        }, checkInterval),
        startTime: Date.now()
      };
      
      captionTrackers.set(id, tracker);
    }

    const obs = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement) {
            const captionEl = node.querySelector('span[data-tid="closed-caption-text"]');
            const authorEl = node.querySelector('span[data-tid="author"]');
            
            if (captionEl) {
              trackCaption(captionEl, authorEl);
            }
          }
        }
      }
    });

    obs.observe(document.body, { childList: true, subtree: true });
  });

  // 10-min timeout
  const timer = setInterval(() => {
    if (Date.now() - lastCaption > 10 * 60 * 1000) finish();
  }, 60000);

  async function finish() {
    clearInterval(timer);
    await finalizeAndProduceImage(transcript);
    await browser.close();
    process.exit(0);
  }

  await page.waitForSelector("text=Enjoy your call? Join Teams today for free", { timeout: 0 });
  finish();
})();