import axios from "axios";
import * as cheerio from "cheerio";

// Function to check if a URL exists
const checkPageExists = async (url: string): Promise<string> => {
  try {
    const response = await axios.get(url, { timeout: 5000 });
    return response.status === 200 ? "✅ Found" : "❌ Not Found";
  } catch {
    return "❌ Not Found";
  }
};

// Function to scrape Google for review pages
const googleSearchCheck = async (query: string): Promise<string> => {
  try {
    const response = await axios.get(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    const $ = cheerio.load(response.data);
    return $("h3").length > 0 ? "✅ Found" : "❌ Not Found";
  } catch {
    return "❌ Not Found";
  }
};

// Main function to check review sites
export const auditReviews = async (siteUrl: string) => {
  try {
    const parsedUrl = new URL(siteUrl);
    const domain = parsedUrl.hostname;

    const reviews = {
      googleReviews: await checkPageExists(`https://www.google.com/search?q=${encodeURIComponent(siteUrl)}+reviews`),
      metaReviews: await checkPageExists(`https://www.facebook.com/search/top?q=${encodeURIComponent(siteUrl)}`),
      trustpilot: await checkPageExists(`https://www.trustpilot.com/review/${domain}`),
      yelpReviews: await checkPageExists(`https://www.yelp.com/biz/${domain}`),
    };

    const searchResults = {
      googleReviews: await googleSearchCheck(`site:google.com ${siteUrl} reviews`),
      metaReviews: await googleSearchCheck(`site:facebook.com ${siteUrl} reviews`),
      trustpilot: await googleSearchCheck(`site:trustpilot.com ${siteUrl}`),
      yelpReviews: await googleSearchCheck(`site:yelp.com ${siteUrl}`),
    };

    return { reviews, searchResults };
  } catch (error) {
    console.error("Audit failed:", error);
    throw new Error("Audit failed.");
  }
};
