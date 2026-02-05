import { chromium } from "playwright";
import { finalizeAndProduceImage } from "./utils/finalize.js";
import dotenv from "dotenv";
dotenv.config();

/* ─────────────────────────────
   Turn captions ON helper
   ───────────────────────────── */
async function turnCaptionsOn(page) {
  try {
    await page.waitForTimeout(2000);
    
    const captionsBtn = page
      .locator('button[aria-label*="captions" i]')
      .first();
    
    const pressed = await captionsBtn.getAttribute("aria-pressed");
    console.log(`🔍 Captions button state: ${pressed}`);
    
    if (pressed !== "true") {
      await captionsBtn.click();
      await page.waitForTimeout(1500);
      console.log("📝 Captions enabled");
    } else {
      console.log("📝 Captions already enabled");
    }
  } catch (e) {
    console.log("⚠️ Failed to enable captions:", e.message);
  }
}

/* ─────────────────────────────
   SCRAPE CAPTIONS (FIXED)
   ───────────────────────────── */
async function scrapeCaptions(page, meetingId, createdAt) {
  let index = 0;
  console.log("🚀 at start of scrapeCaptions");
  let captionsLastSeenAt = Date.now();
  const segments = [];

  console.log("🔧 setting up observer before captions start");
  
  await page.exposeFunction("onCaption", (speaker, text) => {
    console.log(`🗣️  ${speaker}: ${text}`);
    captionsLastSeenAt = Date.now();
    const trimmedCaption = text.trim();
    if (trimmedCaption) {
      segments.push({
        speaker,
        text: trimmedCaption,
        start: index,
        end: index + 1,
      });
      index++;
    }
  });

  // First, turn on captions
  await turnCaptionsOn(page);
  
  // Wait a bit for captions UI to initialize
  await page.waitForTimeout(2000);

  // Now set up the observer
  await page.evaluate(() => {
    // Try multiple ways to find the caption region
    let captionRegion = document.querySelector('[role="region"][aria-label*="Captions"]');
    
    if (!captionRegion) {
      captionRegion = document.querySelector('[jsname="dsyhDe"]');
    }
    
    if (!captionRegion) {
      captionRegion = document.querySelector('.a4cQT');
    }
    
    if (!captionRegion) {
      console.error('❌ Caption region not found');
      return;
    }
    
    console.log('✅ Caption region found:', captionRegion);
    
    let lastKnownSpeaker = "Unknown Speaker";
    const elementTracking = new WeakMap();
    let currentActiveElement = null;
    
    const processCaption = (node) => {
      if (!(node instanceof HTMLElement)) return;
      
      // Find speaker
      let speakerElem = node.querySelector(".NWpY1d") || 
                       node.querySelector('[jsname="tAPELd"]') ||
                       node.querySelector('[class*="speaker"]');
      
      if (!speakerElem && node.parentElement) {
        speakerElem = node.parentElement.querySelector(".NWpY1d") ||
                     node.parentElement.querySelector('[jsname="tAPELd"]');
      }
      
      let speaker = speakerElem?.textContent?.trim();
      if (speaker && speaker.length > 0) {
        lastKnownSpeaker = speaker;
      } else {
        speaker = lastKnownSpeaker;
      }

      // Get caption text
      const clone = node.cloneNode(true);
      const speakerElements = clone.querySelectorAll('.NWpY1d, [jsname="tAPELd"], [class*="speaker"]');
      speakerElements.forEach(el => el.remove());

      const fullText = clone.textContent?.trim() || "";
      
      if (!fullText || fullText.toLowerCase() === speaker.toLowerCase()) {
        return;
      }

      // Get or initialize tracking for this element
      let tracking = elementTracking.get(node);
      if (!tracking) {
        tracking = {
          lastSentText: "",
          debounceTimer: null
        };
        elementTracking.set(node, tracking);
      }

      // Clear any existing timer
      if (tracking.debounceTimer) {
        clearTimeout(tracking.debounceTimer);
      }

      // Check if this is a NEW element (different from current active)
      const isNewElement = node !== currentActiveElement;
      
      if (isNewElement) {
        console.log('🆕 New caption element detected - finalizing previous');
        
        // Finalize the previous element if it exists
        if (currentActiveElement) {
          const prevTracking = elementTracking.get(currentActiveElement);
          if (prevTracking && prevTracking.debounceTimer) {
            clearTimeout(prevTracking.debounceTimer);
          }
        }
        
        // Update to new active element
        currentActiveElement = node;
        
        // For new elements, reset and send the full text after debounce
        tracking.lastSentText = "";
      }

      // Set a debounce timer to send only the NEW part after text stops changing
      tracking.debounceTimer = setTimeout(() => {
        // Extract only the NEW portion
        let newPart = fullText;
        
        if (tracking.lastSentText) {
          // Check if this is an append (starts with what we sent before)
          if (fullText.startsWith(tracking.lastSentText)) {
            newPart = fullText.substring(tracking.lastSentText.length).trim();
          }
          // Otherwise it's a completely new caption (shouldn't happen in same element)
        }
        
        if (newPart) {
          window.onCaption?.(speaker, newPart);
          tracking.lastSentText = fullText; // Update to the full text we now know
        }
      }, 800); // Wait 800ms after text stops changing
    };

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Handle added nodes (NEW caption elements - different speaker or new sentence)
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              processCaption(node);
            }
          });
        }
        
        // Handle text changes in existing elements (SAME speaker continuing)
        if (mutation.type === "characterData" || mutation.type === "childList") {
          let targetElement = mutation.target;
          if (!(targetElement instanceof HTMLElement)) {
            targetElement = mutation.target.parentElement;
          }
          if (targetElement) {
            processCaption(targetElement);
          }
        }
      }
    });

    observer.observe(captionRegion, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    
    console.log('👂 Observer attached and listening');
  });

  return {
    getSegments: () => segments,
    getLastSeen: () => captionsLastSeenAt,
  };
}

/* ─────────────────────────────
   MAIN
   ───────────────────────────── */
(async () => {
  const context = await chromium.launchPersistentContext(
    "./chrome-profile",
    {
      headless: false,
      channel: "chrome",
      viewport: null,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--start-maximized",
      ],
    }
  );

  const page = await context.newPage();
  page.setDefaultTimeout(0);

  console.log("🌐 Opening Google login page...");
  await page.goto("https://accounts.google.com");

  console.log(`
==================================================
👉 MANUAL STEP (ONE TIME ONLY)
==================================================
Log into Google fully and stay logged in.
==================================================
`);

  await page.waitForSelector(
    'img[alt*="Google Account"], a[href*="SignOutOptions"]',
    { timeout: 0 }
  );

  console.log("✅ Logged in");

  console.log("🎥 Opening Google Meet...");
  await page.goto("https://meet.google.com/pzx-ifvn-zdg");

  await page.waitForSelector(
    'button span:has-text("Join now"), button span:has-text("Ask to join")',
    { timeout: 60000 }
  );

  // Disable mic
  try {
    const mic = page.locator('button[aria-label*="microphone"]').first();
    if (await mic.count()) {
      await mic.click();
      console.log("🎤 Microphone disabled");
    }
  } catch {}

  // Disable cam
  try {
    const cam = page.locator('button[aria-label*="camera"]').first();
    if (await cam.count()) {
      await cam.click();
      console.log("📹 Camera disabled");
    }
  } catch {}

  console.log("🚪 Joining meeting...");
  await page.click(
    'button span:has-text("Join now"), button span:has-text("Ask to join"),button span:has-text("Switch here")'
  );

  await page.waitForSelector(
    'button[aria-label*="captions"]',
    { timeout: 120000 }
  );

  console.log("✅ Joined meeting");

  /* ─────────────────────────────
     Start caption scraping
     ───────────────────────────── */
  const meetingId = "kkt-kjcr-qzr";
  const createdAt = new Date().toISOString();

  const { getSegments, getLastSeen } = await scrapeCaptions(
    page,
    meetingId,
    createdAt
  );

  /* ─────────────────────────────
     Status updates every 30 seconds
     ───────────────────────────── */
  const statusInterval = setInterval(() => {
    const segments = getSegments();
    const timeSinceLastCaption = Math.floor((Date.now() - getLastSeen()) / 1000);
    console.log(`\n📊 Status: ${segments.length} segments captured, last caption ${timeSinceLastCaption}s ago`);
  }, 30000);

  /* ─────────────────────────────
     Silence timeout (10 minutes)
     ───────────────────────────── */
  const timer = setInterval(async () => {
    if (Date.now() - getLastSeen() > 10 * 60 * 1000) {
      console.log("⏱️ Silence timeout (10 min) — finishing");
      await finish();
    }
  }, 60000);

  let isFinishing = false;

  async function finish() {
    if (isFinishing) return; // Prevent multiple calls
    isFinishing = true;

    console.log("\n🛑 Stopping caption capture...");
    
    clearInterval(timer);
    clearInterval(statusInterval);

    const allSegments = getSegments();
    console.log(`\n📊 Total segments captured: ${allSegments.length}`);

    const transcript = allSegments
      .map(s => `${s.speaker}: ${s.text}`)
      .join("\n");

    console.log("\n📄 Full transcript:");
    console.log("─".repeat(50));
    console.log(transcript || "(empty)");
    console.log("─".repeat(50));

    if (transcript.trim()) {
      console.log("\n🖼️ Finalizing transcript and generating image...");
      await finalizeAndProduceImage(transcript);
    } else {
      console.log("\n⚠️ No transcript to process (empty)");
    }

    await context.close();
    process.exit(0);
  }

  // Handle graceful shutdown on Ctrl+C
  process.on('SIGINT', async () => {
    console.log("\n\n⚠️ Received Ctrl+C - saving transcript before exit...");
    await finish();
  });

  // Handle other termination signals
  process.on('SIGTERM', async () => {
    console.log("\n\n⚠️ Received termination signal - saving transcript...");
    await finish();
  });

  page.on("close", finish);

  console.log("👂 Listening for captions...");
  console.log("\n💡 To stop and save transcript:");
  console.log("   • Press Ctrl+C (will save before exiting)");
  console.log("   • Close the browser window");
  console.log("   • Wait 10 minutes of silence (auto-stop)\n");
})();