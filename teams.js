const { chromium } = require("playwright");

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

  console.log(">> Navigating to meeting...");
  await page.goto("https://teams.live.com/meet/9322545022766?p=kWlFIxYSL31rHN5lub&webjoin=true");

  // Wait for the name input field
  await page.waitForSelector('input[type="text"]');
  await page.fill('input[type="text"]', "Transcript Bot");

  // Disable audio (try multiple approaches)
  try {
    await page.getByRole("radio", { name: /Don't use audio/i }).check();
  } catch (err) {
    console.warn(">> Could not find 'Don't use audio' option — continuing anyway.");
  }

  // Join meeting
  console.log(">> Joining meeting...");
  await page.click('button:has-text("Join now")');

  // Wait for meeting UI
  await page.waitForSelector('[data-cid="call-screen-wrapper"]');
  console.log(">> Logged in and meeting joined.");

  // Open the “More” menu (retry if needed)
  console.log(">> Opening 'More' menu...");
  try {
    await page.locator('#callingButtons-showMoreBtn').click({ timeout: 10000 });
  } catch (err) {
    console.warn(">> Primary 'More' button not found, trying fallback...");
    const buttons = await page.getByRole('button', { name: /More/i }).all();
    if (buttons.length > 0) await buttons[0].click();
    else throw new Error("Could not find any 'More' button to click.");
  }

  // Enable captions
  try {
    await page.getByRole("menuitem", { name: /Captions/i }).click({ timeout: 5000 });
    console.log(">> Captions enabled. Waiting for first caption...");
  } catch (err) {
    console.warn(">> Could not enable captions automatically.");
  }

  // Transcript + state
  let transcript = "";
  let recording = true;
  let lastCaptionTime = Date.now();

  // Callback for each caption
  await page.exposeFunction("onNewCaption", (author, caption) => {
    lastCaptionTime = Date.now();
    const lower = caption.toLowerCase();

    if (lower.includes("pause recording")) {
      recording = false;
      console.log(">> Recording paused.");
      return;
    }
    if (lower.includes("start recording")) {
      recording = true;
      console.log(">> Recording resumed.");
      return;
    }
    if (lower.includes("stop recording")) {
      console.log(">> Recording stopped by voice command.");
      console.log("\n=== Transcript ===\n");
      console.log(transcript.trim());
      process.exit(0);
    }

    if (recording) {
      const entry = `${author}: ${caption}`;
      transcript += entry + "\n";
      console.log(entry);
    }
  });

  // Inject MutationObserver
  await page.evaluate(() => {
    const seen = new Set();

    function waitUntilStable(el, authorEl, callback, delay = 500) {
      let last = el.innerText;
      let timer;
      const check = () => {
        const now = el.innerText;
        if (now === last) {
          const author = authorEl ? authorEl.innerText.trim() : "Unknown";
          callback(author, now);
        } else {
          last = now;
          timer = setTimeout(check, delay);
        }
      };
      timer = setTimeout(check, delay);
    }

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const captionEl = node.querySelector?.('span[data-tid="closed-caption-text"]');
          const authorEl = node.querySelector?.('span[data-tid="author"]');

          if (captionEl) {
            waitUntilStable(captionEl, authorEl, (author, caption) => {
              const entry = `${author}: ${caption}`;
              if (!seen.has(entry)) {
                seen.add(entry);
                window.onNewCaption(author, caption);
              }
            });
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  });

  // Inactivity timeout
  const checkInactivity = setInterval(async () => {
    if (Date.now() - lastCaptionTime > 10 * 60 * 1000) {
      console.log(">> No captions for 10 minutes. Leaving meeting.");
      console.log("\n=== Transcript ===\n");
      console.log(transcript.trim());
      clearInterval(checkInactivity);
      await browser.close();
      process.exit(0);
    }
  }, 60 * 1000);

  // Detect meeting ended
  await page.waitForSelector("text=Enjoy your call? Join Teams today for free", { timeout: 0 });
  console.log("\n>> Meeting ended. Final transcript:\n");
  console.log(transcript.trim());

  clearInterval(checkInactivity);
  await browser.close();
})();
