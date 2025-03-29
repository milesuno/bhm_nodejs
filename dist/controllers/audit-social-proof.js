"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditReviews = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
// Function to check if a URL exists
const checkPageExists = async (url) => {
    try {
        const response = await axios_1.default.get(url, { timeout: 5000 });
        return response.status === 200 ? "✅ Found" : "❌ Not Found";
    }
    catch {
        return "❌ Not Found";
    }
};
// Function to scrape Google for review pages
const googleSearchCheck = async (query) => {
    try {
        const response = await axios_1.default.get(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
            headers: { "User-Agent": "Mozilla/5.0" },
        });
        const $ = cheerio.load(response.data);
        return $("h3").length > 0 ? "✅ Found" : "❌ Not Found";
    }
    catch {
        return "❌ Not Found";
    }
};
// Main function to check review sites
const auditReviews = async (siteUrl) => {
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
    }
    catch (error) {
        console.error("Audit failed:", error);
        throw new Error("Audit failed.");
    }
};
exports.auditReviews = auditReviews;
