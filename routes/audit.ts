import express from "express";
import asyncMiddleware from "./../middleware/asyncMiddleware";
import { auditReviews } from "../controllers/audit-social-proof"; // Import auditReviews

const router = express.Router();
const puppeteer = require("puppeteer");
const Audit = require("../models/Audit");

router.post(
  "/",
  asyncMiddleware(async (req: any, res: any) => {
    const { url } = req.body;
    let document: any;

    try {
      const browser = await puppeteer.launch({ headless: "new" });
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: "load" });

      // **Extract Meta Tags**
      const metaTitle = await page.evaluate(
        () => document.querySelector("title")?.innerText || "❌ Missing"
      );
      const metaDesc = await page.evaluate(
        () =>
          document.querySelector('meta[name="description"]')?.content ||
          "❌ Missing"
      );
      const metaDescLength =
        metaDesc.length >= 150 && metaDesc.length <= 160
          ? "✅ Good"
          : "⚠️ Too Long/Short";

      // **Check for SEO Best Practices**
      const seoChecks = await page.evaluate(() => {
        const h1 = document.querySelector("h1") ? "✅ Found" : "❌ Not Found";
        const canonical =
          document.querySelector('link[rel="canonical"]')?.href || "❌ Missing";
        const viewport = document.querySelector('meta[name="viewport"]')
          ? "✅ Found"
          : "❌ Not Mobile Optimized";

        const images = [...document?.querySelectorAll("img")];
        const imagesWithAlt = images.filter(
          (img) =>
            img.hasAttribute("alt") && img.getAttribute("alt").trim() !== ""
        ).length;
        const imagesWithoutAlt = images.length - imagesWithAlt;
        const imageAltCheck =
          imagesWithoutAlt > 0
            ? `⚠️ ${imagesWithoutAlt} Missing`
            : "✅ All Images Have Alt";

        return { h1, canonical, viewport, imageAltCheck };
      });

      // **Check for Tracking Tools**
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

        const adobeAnalytics =
          scripts.some(
            (src) => src.includes("omniture") || src.includes("adobedtm.com")
          ) || window?.s;

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

      // **Check for Consent Banner Elements**
      const consentBanner = await page.evaluate(() => {
        const keywords = ["cookie", "privacy", "consent", "gdpr"];
        const allTexts = [...document.querySelectorAll("div, p, button")].map(
          (el) => el.innerText.toLowerCase()
        );

        return allTexts.some((text) =>
          keywords.some((keyword) => text.includes(keyword))
        )
          ? "✅ Found"
          : "❌ Not Found";
      });

      await browser.close();

      const acceptConsentBanner = async (page: any) => {
        try {
          // Wait for 3 seconds for banner to appear
          await new Promise((resolve) => setTimeout(resolve, 3000));

          const consentButtonSelectors = [
            'button[aria-label*="consent"]',
            'button[aria-label*="agree"]',
            'button:contains("Accept")',
            'button:contains("Agree")',
            'button:contains("Allow All")',
            '[id*="accept"], [class*="accept"]',
            '[id*="agree"], [class*="agree"]',
            '[id*="allow"], [class*="allow"]',
            'button[role="button"]',
          ];

          let foundBanner = false;

          // 1️⃣ **Check for consent banners inside iframes**
          const frames = page.frames();
          for (const frame of frames) {
            try {
              if (frame.isDetached()) {
                console.log("⚠️ Skipping detached frame");
                continue;
              }

              const buttonExists = await frame.evaluate((selectors: any) => {
                return selectors.some((selector: any) =>
                  document.querySelector(selector)
                );
              }, consentButtonSelectors);

              if (buttonExists) {
                console.log(
                  "✅ Found consent button inside iframe. Clicking..."
                );
                await frame.evaluate((selectors: any) => {
                  const button = selectors
                    .map((sel: any) => document.querySelector(sel))
                    .find(Boolean);
                  if (button) button.click();
                }, consentButtonSelectors);

                await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for response
                console.log("✅ Accepted Consent Banner inside iframe");
                foundBanner = true;
                break; // Exit after clicking button in iframe
              }
            } catch (error: any) {
              console.log("⚠️ Error accessing iframe:", error.message);
            }
          }

          // 2️⃣ **Check for consent banners in the main page**
          if (!foundBanner) {
            const buttonExists = await page.evaluate((selectors: any) => {
              return selectors.some((selector: any) =>
                document.querySelector(selector)
              );
            }, consentButtonSelectors);

            if (buttonExists) {
              console.log(
                "✅ Found consent button on the main page. Clicking..."
              );
              await Promise.all([
                page.evaluate((selectors: any) => {
                  const button = selectors
                    .map((sel: any) => document.querySelector(sel))
                    .find(Boolean);
                  if (button) button.click();
                }, consentButtonSelectors),
                page.waitForNavigation({
                  waitUntil: "networkidle2",
                  timeout: 10000,
                }), // Wait for page reload
              ]);

              console.log("✅ Accepted Consent Banner & Page Reloaded");
              foundBanner = true;

              console.log("⏳ Waiting for tags to load...");
              await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait for tags to load, adjust time if needed
            }
          }

          if (!foundBanner) {
            console.log("ℹ️ No consent banner found.");
          }
        } catch (error: any) {
          console.log("⚠️ Error handling consent banner:", error.message);

          if (error.message.includes("detached")) {
            console.log("🔄 Detected detached frame, reloading the page...");
            // Wait for the page to fully reload and stabilize before retrying
            await page.reload({ waitUntil: "networkidle2" });
            await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait a few seconds for page to stabilize
            await page.waitForSelector("body", { visible: true });

            // Retry the banner acceptance process
            await acceptConsentBanner(page);
          }
        }
      };

      // await acceptConsentBanner(page);

      // **Store Results in Database**
      const audit = await Audit.create({
        url,
        googleTagManager: trackingScripts.googleTagManager,
        googleAnalytics: trackingScripts.googleAnalytics,
        googleAnalytics4: trackingScripts.googleAnalytics4,
        adobeAnalytics: trackingScripts.adobeAnalytics,
        adobeTarget: trackingScripts.adobeTarget,
        tealium: trackingScripts.tealium,
        tiktokPixel: trackingScripts.tiktokPixel,
        floodlight: trackingScripts.floodlight,
        crazyEgg: trackingScripts.crazyEgg,
        hotjar: trackingScripts.hotjar,
        contentSquare: trackingScripts.contentSquare,
        oneTrust: trackingScripts.oneTrust,
        consentBanner: consentBanner,

        seoTitle: metaTitle,
        seoDescription: metaDesc,
        seoDescriptionLength: metaDescLength,
        seoH1: seoChecks.h1,
        seoCanonical: seoChecks.canonical,
        seoViewport: seoChecks.viewport,
        seoImageAlt: seoChecks.imageAltCheck,
      });

      res.json(audit);
    } catch (err) {
      console.error(err);
      return res.status(500).send("Error scanning website");
    }
  })
);

export default router;
