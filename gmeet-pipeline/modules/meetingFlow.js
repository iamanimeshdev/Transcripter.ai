// modules/meetingFlow.js
// Google Meet: login, join, mute, and meeting-end detection.

/**
 * Wait for the user to manually log into Google (one-time step).
 * @param {Page} page
 */
export async function loginToGoogle(page) {
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
}

/**
 * Navigate to a Google Meet link, mute mic/cam, and click Join.
 * @param {Page} page
 * @param {string} meetUrl - The full Google Meet URL
 * @returns {string} meetingTitle
 */
export async function joinMeeting(page, meetUrl) {
    let meetingTitle = "Google Meet";

    console.log("🎥 Opening Google Meet...");
    await page.goto(meetUrl);

    // Try to capture meeting title
    try {
        await page.waitForSelector('div[data-meeting-title], h1', { timeout: 10000 });
        meetingTitle = await page.evaluate(() => {
            const el = document.querySelector('div[data-meeting-title]');
            if (el) return el.getAttribute('data-meeting-title');
            const h1 = document.querySelector('h1');
            return h1 ? h1.innerText : "Google Meet";
        });
        console.log(`📌 Meeting Title: ${meetingTitle}`);
    } catch {
        console.log("📌 Could not capture meeting title, using default.");
    }

    // Wait for join button
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
    } catch { }

    // Disable cam
    try {
        const cam = page.locator('button[aria-label*="camera"]').first();
        if (await cam.count()) {
            await cam.click();
            console.log("📹 Camera disabled");
        }
    } catch { }

    // Click join
    console.log("🚪 Joining meeting...");
    await page.click(
        'button span:has-text("Join now"), button span:has-text("Ask to join"),button span:has-text("Switch here")'
    );

    await page.waitForTimeout(8000);
    console.log("✅ Joined meeting\n");

    return meetingTitle;
}

/**
 * Returns a Promise that resolves when the meeting ends.
 * Detects "You've left the meeting" text or browser/page close.
 * @param {Page} page
 * @returns {Promise<void>}
 */
export function waitForMeetingEnd(page) {
    return new Promise((resolve) => {
        console.log("👂 Recording meeting audio...");
        console.log("   Bot will stop automatically when the meeting ends.\n");

        let resolved = false;
        function done(reason) {
            if (resolved) return;
            resolved = true;
            clearInterval(poll);
            console.log(`\n${reason}`);
            resolve();
        }

        const poll = setInterval(async () => {
            try {
                const meetingEnded = await page.evaluate(() => {
                    const body = document.body?.innerText || "";
                    return (
                        body.includes("You've left the meeting") ||
                        body.includes("You left the meeting") ||
                        body.includes("The meeting has ended") ||
                        body.includes("You were removed") ||
                        body.includes("Return to home screen")
                    );
                });

                if (meetingEnded) {
                    done("📞 Meeting ended detected!");
                }
            } catch {
                done("🌐 Browser closed — treating as meeting end");
            }
        }, 5000);

        // Also resolve on page close
        page.on("close", () => {
            done("🌐 Page closed — treating as meeting end");
        });
    });
}
