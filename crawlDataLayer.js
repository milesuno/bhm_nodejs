const puppeteer = require("puppeteer");
const fs = require("fs");
const { URL } = require("url");

const args = process.argv.slice(2);
const START_URL = args[0];
const DATALAYER_NAME = args[1];

if (!START_URL || !DATALAYER_NAME) {
  console.error("Missing URL or dataLayer name.");
  process.exit(1);
}

console.log("Arguments received:", { START_URL, DATALAYER_NAME });

const visited = new Set();
const results = [];

async function extractDataLayer(page, dataLayerName) {
  return await page.evaluate((name) => {
    return window[name] || null;
  }, dataLayerName);
}

async function crawlPage(page, url, baseDomain, dataLayerName) {
  if (visited.has(url)) return;
  visited.add(url);

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });

    const dataLayer = await extractDataLayer(page, dataLayerName);

    results.push({
      url,
      hasDataLayer: Boolean(dataLayer),
      dataLayer: dataLayer || null,
    });

    // Extract internal links
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a"))
        .map((a) => a.href)
        .filter((href) => href.startsWith("http"))
    );

    const internalLinks = links.slice(0, 5).filter((link) => {
      try {
        const linkHost = new URL(link).hostname;
        return linkHost === baseDomain;
      } catch (e) {
        return false;
      }
    });

    for (const link of internalLinks) {
      if (!visited.has(link)) {
        await crawlPage(page, link, baseDomain, dataLayerName);
      }
    }
  } catch (err) {
    console.error(`Error visiting ${url}:`, err.message);
    results.push({
      url,
      hasDataLayer: false,
      dataLayer: null,
      error: err.message,
    });
  }
}

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    const baseDomain = new URL(START_URL).hostname;

    await crawlPage(page, START_URL, baseDomain, DATALAYER_NAME);

    await browser.close();

    const report = {
      scannedAt: new Date().toISOString(),
      startUrl: START_URL,
      dataLayerName: DATALAYER_NAME,
      totalPagesScanned: results.length,
      pagesWithDataLayer: results.filter((r) => r.hasDataLayer).length,
      pages: results,
    };

    fs.writeFileSync("datalayer_report.json", JSON.stringify(report, null, 2));
    console.log("Report written to datalayer_report.json");
    process.exit(0);
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
})();
