import puppeteer from "puppeteer";
import { auditReviews } from "./audit-social-proof"; // Import auditReviews

export const runAudit = async (siteUrl: string) => {
  console.log(`🔍 Auditing site: ${siteUrl}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  let document: any;
  let scriptUrls: string[] = []; // Define scriptUrls before using it
  const page = await browser.newPage();

  // await page.on("request", (req) => {
  //   if (req.resourceType() === "script") {
  //     console.log({ req });
  //     const url = req.url();
  //     scriptUrls.push(url); // Store the URL
  //     console.log("📜", scriptUrls);

  //     console.log("📜 Script detected:", url); // Log the script URL    }
  //     scriptUrls = scriptUrls;
  //   }
  // });
  // console.log(scriptUrls);
  async function waitForNetworkIdle(
    page: any,
    timeout = 10000,
    idleTime = 500
  ) {
    let timeoutHandle: NodeJS.Timeout;
    let resolveFunc = () => {};

    const promise = new Promise<void>((resolve) => (resolveFunc = resolve));

    let activeRequests = 0;
    let lastChange = Date.now();

    function checkIdle() {
      if (activeRequests === 0 && Date.now() - lastChange > idleTime) {
        clearTimeout(timeoutHandle);
        resolveFunc();
      } else {
        setTimeout(checkIdle, 100);
      }
    }

    page.on("request", () => {
      activeRequests++;
      lastChange = Date.now();
    });

    page.on("requestfinished", () => {
      activeRequests--;
      lastChange = Date.now();
    });

    page.on("requestfailed", () => {
      activeRequests--;
      lastChange = Date.now();
    });

    timeoutHandle = setTimeout(resolveFunc, timeout); // fallback in case idle never occurs
    checkIdle();

    return promise;
  }

  try {
    await page.goto(siteUrl);
    await waitForNetworkIdle(page, 10000, 500);

    // Scan for tracking scripts
    const trackingScripts = await page.evaluate(() => {
      const scripts = [...document.scripts].map((script) => script.src);
      const pageText = document.documentElement.innerHTML;
      let window: any;
      // Check for common tracking scripts
      const googleAnalytics =
        scripts.some((src: any) => src.includes("GoogleAnalyticsObject")) ||
        window?.ga ||
        window?.GoogleAnalyticsObject;

      const googleTagManager =
        scripts.some((src: any) =>
          src.includes("googletagmanager.com/gtm.js")
        ) || window?.dataLayer;

      const googleAnalytics4 =
        pageText.includes("gtag('config')") || window?.gtag;

      // const hasGA4 =
      //   scriptUrls.includes("https://www.googletagmanager.com/gtag/js") ||
      //   pageText.includes("gtag('config'");

      const adobeAnalytics =
        scripts.some(
          (src) => src.includes("omniture") || src.includes("adobedtm.com")
        ) || window?.s;

      // const hasAdobeAnalytics = [...scriptUrls].some(
      //   (url: any) =>
      //     url.includes("assets.adobedtm.com") ||
      //     url.includes("omniture") ||
      //     url.includes("adobe")
      // );

      const adobeTarget =
        scripts.some((src) => src.includes("tt.omtrdc.net")) ||
        window?._satellite;

      const tealium =
        scripts.some((src) => src.includes("tags.tiqcdn.com/utag")) ||
        window?.utag;

      const tiktokPixel =
        scripts.some((src) => src.includes("ticdn.com/pixel")) ||
        window?.tiktokPixel;

      const floodlight =
        scripts.some((src) => src.includes("fls.doubleclick.net")) ||
        window?.FLC;

      const crazyEgg =
        scripts.some((src) => src.includes("crazyegg.com")) || window?.CE;

      const hotjar =
        scripts.some((src) => src.includes("hotjar.com")) || window?.hj;

      const contentSquare =
        scripts.some((src) => src.includes("contentsquare.net")) ||
        window?._contentSquare;

      const oneTrust =
        scripts.some(
          (src) =>
            src.includes("onetrust.com") || src.includes("cookie-consent")
        ) || window?.OneTrust;

      return {
        googleTagManager: googleTagManager ? "✅ Found" : "❌ Not Found",
        googleAnalytics: googleAnalytics ? "✅ Found" : "❌ Not Found",
        googleAnalytics4: googleAnalytics4
          ? "✅ GA4 Found"
          : "❌ GA4 Not Found",
        adobeAnalytics: adobeAnalytics ? "✅ Found" : "❌ Not Found",
        adobeTarget: adobeTarget ? "✅ Found" : "❌ Not Found",
        tealium: tealium ? "✅ Found" : "❌ Not Found",
        tiktokPixel: tiktokPixel ? "✅ Found" : "❌ Not Found",
        floodlight: floodlight ? "✅ Found" : "❌ Not Found",
        crazyEgg: crazyEgg ? "✅ Found" : "❌ Not Found",
        hotjar: hotjar ? "✅ Found" : "❌ Not Found",
        contentSquare: contentSquare ? "✅ Found" : "❌ Not Found",
        oneTrust: oneTrust ? "✅ Found" : "❌ Not Found",
      };
    });

    // Run review site audit
    const reviewAuditResults = await auditReviews(siteUrl);

    await browser.close();

    return {
      trackingScripts,
      reviewAuditResults,
    };
  } catch (error) {
    console.error("🚨 Audit failed:", error);
    await browser.close();
    throw new Error("Audit failed.");
  }
};
