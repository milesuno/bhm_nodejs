import puppeteer from "puppeteer";

const targetUrl = "https://example.com"; // Replace with your target site

type TechKeys =
  | "googleTagManager"
  | "googleAnalytics"
  | "googleAnalytics4"
  | "adobeAnalytics"
  | "adobeTarget"
  | "tealium"
  | "tiktokPixel"
  | "floodlight"
  | "crazyEgg"
  | "hotjar"
  | "contentSquare"
  | "oneTrust";

export const runAudit = async (siteUrl: string) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });  const context = await browser.createBrowserContext();
  const page = await context.newPage();

  const techPatterns: Record<TechKeys, RegExp> = {
    googleTagManager: /googletagmanager\.com/,
    googleAnalytics: /google-analytics\.com/,
    googleAnalytics4: /gtag\/js\?id=G-/,
    adobeAnalytics: /(?:omniture|adobedc|sc)\/(?:s_code|s\.js)|\/b\/ss\//,
    adobeTarget: /tt\.omtrdc\.net|demdex\.net/,
    tealium: /tealiumiq\.com/,
    tiktokPixel: /tiktok\.com\/tracking/,
    floodlight: /fls\.doubleclick\.net/,
    crazyEgg: /crazyegg\.com/,
    hotjar: /hotjar\.(com|io)/,
    contentSquare: /contentsquare\.net/,
    oneTrust: /(cdn\.cookielaw\.org|onetrust\.com)/,
  };
  const domIndicators: Partial<Record<TechKeys, string[]>> = {
    googleTagManager: ['script[src*="googletagmanager.com"]'],
    googleAnalytics: ['script[src*="google-analytics.com"]'],
    googleAnalytics4: ['script[src*="gtag/js?id=G-"]'],
    adobeAnalytics: ['script[src*="/b/ss/"]', 'script[src*="omniture"]'],
    adobeTarget: ['script[src*="tt.omtrdc.net"]', 'script[src*="demdex.net"]'],
    tealium: ['script[src*="tealiumiq.com"]'],
    tiktokPixel: [
      'script[src*="tiktok.com/tracking"]',
      'script[src*="analytics.tiktok.com"]',
    ],
    floodlight: ['script[src*="fls.doubleclick.net"]'],
    crazyEgg: ['script[src*="crazyegg.com"]'],
    hotjar: ['script[src*="hotjar.com"]', 'script[src*="hotjar.io"]'],
    contentSquare: ['script[src*="contentsquare.net"]'],
    oneTrust: [
      'script[src*="cookielaw.org"]',
      'script[src*="onetrust.com"]',
      "#onetrust-banner-sdk", // Common cookie consent banner
    ],
  };

  async function handleConsentBanner(page: any) {
    try {
      // Example 1: Look for a button with "Accept", "Agree", etc.
      const acceptButtonSelectors = [
        'button[aria-label*="accept"]',
        'button[aria-label*="Agree"]',
        'button[aria-label*="Alle akzeptieren"]', // German example
        "#onetrust-accept-btn-handler", // OneTrust CMP example
        ".cc-accept", // Cookie Consent class example
        '[data-testid="uc-accept-all-button"]', // Usercentrics
      ];

      for (const selector of acceptButtonSelectors) {
        const button = await page.$(selector);
        if (button) {
          console.log(`Clicking consent banner button: ${selector}`);
          await button.click();
          await new Promise((resolve) => setTimeout(resolve, 5000)); // ✅ Works on all versions
          return true;
        }
      }

      // Example 2: If iframe-based CMP is used (like Usercentrics, TrustArc, etc.)
      const frames = page.frames();
      for (const frame of frames) {
        const button = await frame.$("#onetrust-accept-btn-handler");
        if (button) {
          console.log(`Clicking consent button inside iframe`);
          await button.click();
          await new Promise((resolve) => setTimeout(resolve, 5000)); // ✅ Works on all versions
          return true;
        }
      }

      // Generic fallback: search for buttons with text "Accept" or "Agree"
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(
          document.querySelectorAll(
            'button, input[type="button"], input[type="submit"]'
          )
        );
        for (const button of buttons) {
          const text = (
            button.textContent ||
            button.getAttribute("value") ||
            ""
          )
            .trim()
            .toLowerCase();
          if (
            [
              "accept",
              "accept all",
              "accept all cookies",
              "agree",
              "yes, i agree",
              "i accept",
              "allow all",
              "allow",
              "confirm",
            ].some((keyword) => text.includes(keyword))
          ) {
            (button as HTMLElement).click();
            return true;
          }
        }
        return false;
      });

      if (clicked) {
        console.log("Clicked generic consent button based on text");
        await new Promise((resolve) => setTimeout(resolve, 5000)); // ✅ Works on all versions
        return true;
      }

      console.log("No consent banner detected.");
      return false;
    } catch (err) {
      console.error("Error handling consent banner:", err);
      return false;
    }
  }

  let foundUrls: Record<TechKeys, string[]> | any = Object.keys(
    techPatterns
  ).reduce((acc, key) => {
    acc[key as TechKeys] = [];
    return acc;
  }, {} as Record<TechKeys, string[]>);

  try {
    page.on("request", (request) => {
      const url = request.url();
      for (const tech of Object.keys(techPatterns) as TechKeys[]) {
        const pattern = techPatterns[tech];
        if (pattern.test(url)) {
          foundUrls[tech].push(url);
        }
      }
    });
    await page.goto(siteUrl, { waitUntil: "networkidle2", timeout: 30000 });
    await page.goto(siteUrl, { waitUntil: "domcontentloaded" });
    await new Promise((resolve) => setTimeout(resolve, 5000)); // ✅ Works on all versions

    await handleConsentBanner(page);

    // LOOKS LIKE JUST A TIMER??
    for (const [tech, selectors] of Object.entries(domIndicators) as [
      TechKeys,
      string | string[]
    ][]) {
      const selectorArray = Array.isArray(selectors) ? selectors : [selectors];
      for (const selector of selectorArray) {
        await page.waitForSelector(selector, { timeout: 5000 }).catch(() => {});
      }
    }
    await new Promise((res) => setTimeout(res, 3000));

    // NETWORK REQUEST REPORT
    const report: Record<TechKeys, string> = Object.keys(techPatterns).reduce(
      (acc: any, key) => {
        const tech = key as TechKeys;
        acc[tech] =
          tech === "googleAnalytics4"
            ? foundUrls[tech].length
              ? true
              : false
            : foundUrls[tech].length
            ? true
            : false;
        return acc;
      },
      {} as Record<TechKeys, string>
    );

    console.log("\n📊 Technology Detection Report:\n", report);

    console.log("\n🔎 Matching URLs:");
    for (const tech of Object.keys(foundUrls) as TechKeys[]) {
      if (foundUrls[tech].length) {
        console.log(`\n${tech}:`);
        foundUrls[tech].forEach((u: any) => console.log("  ", u));
      }
    }

    const techChecks = {
      tealium: () =>
        typeof (window as any).utag !== "undefined" ||
        typeof (window as any).utag_data !== "undefined",

      google_analytics_universal: () =>
        typeof (window as any).ga === "function" ||
        typeof (window as any)._gaq !== "undefined",

      google_analytics_4: () => typeof (window as any).gtag === "function",

      google_tag_manager: () =>
        typeof (window as any).dataLayer !== "undefined",

      facebook_pixel: () => typeof (window as any).fbq === "function",

      hotjar: () => typeof (window as any).hj === "function",

      segment: () =>
        typeof (window as any).analytics === "object" &&
        typeof (window as any).analytics.track === "function",

      mixpanel: () =>
        typeof (window as any).mixpanel === "object" &&
        typeof (window as any).mixpanel.track === "function",

      adobe_analytics: () =>
        typeof (window as any).s === "object" ||
        typeof (window as any).AppMeasurement === "function",

      matomo: () => Array.isArray((window as any)._paq),
    };

    // DOM Check
    const found = await page.evaluate((checks) => {
      const results: Record<string, boolean> = {};
      for (const [key, checkFnStr] of Object.entries(checks)) {
        try {
          // Rebuild function from string (function.toString not serializable)
          const fn = new Function(`return (${checkFnStr})();`);
          results[key] = fn();
        } catch {
          results[key] = false;
        }
      }
      return results;
    }, Object.fromEntries(Object.entries(techChecks).map(([key, fn]) => [key, fn.toString()])));

    // TODO: Create Final Report
    // IF tech pass CSS check OR Network Request Check
    // report = NETWORK
    // found = DOM
    let audit = {
      tealium: report["tealium"] || found["tealium"],
      googleTagManager: report["googleTagManager"] || found["googleTagManager"],
      googleAnalytics: report["googleAnalytics"] || found["googleAnalytics"],
      googleAnalytics4: report["googleAnalytics4"] || found["googleAnalytics4"],
      adobeAnalytics: report["adobeAnalytics"] || found["adobeAnalytics"],
      adobeTarget: report["adobeTarget"] || found["adobeTarget"],
      tiktokPixel: report["tiktokPixel"] || found["tiktokPixel"],
      crazyEgg: report["crazyEgg"] || found["crazyEgg"],
      hotjar: report["hotjar"] || found["hotjar"],
    };

    await context.close();
    return { siteUrl, report, found, audit, foundUrls };

    // Wait a little longer for delayed scripts to load
  } catch (error) {
    console.error("❗ Navigation error:", (error as Error).message);
  }
  await browser.close();
};
