// modules/browser.js
// Launches a persistent Chromium context with audio-friendly flags.

import { chromium } from "playwright";

/**
 * Launch a persistent Chrome browser context optimized for audio capture.
 * @returns {{ context: BrowserContext, page: Page }}
 */
export async function launchBrowser() {
    const context = await chromium.launchPersistentContext(
        "./chrome-profile",
        {
            headless: false,
            channel: "chrome",
            viewport: null,
            args: [
                "--disable-blink-features=AutomationControlled",
                "--start-maximized",
                "--autoplay-policy=no-user-gesture-required",
                "--use-fake-device-for-media-stream",
                "--use-fake-ui-for-media-stream",
                "--disable-features=AudioServiceOutOfProcess",
            ],
        }
    );

    const page = await context.newPage();
    page.setDefaultTimeout(0);

    return { context, page };
}
