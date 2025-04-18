"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const audit_1 = require("./controllers/audit");
const audit_social_proof_1 = require("./controllers/audit-social-proof");
const asyncMiddleware_1 = __importDefault(require("./middleware/asyncMiddleware"));
const cors_1 = __importDefault(require("cors"));
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const axios = require("axios");
const cron = require("node-cron");
const app = express();
const nodemailer = require("nodemailer");
const puppeteer = require("puppeteer");
const Article = require("./models/article");
const Audit = require("./models/audit");
app.use(express.json());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Expose-Headers", "x-auth-token");
    next();
});
app.use((0, cors_1.default)({
    origin: "*", // Change to your frontend domain
    credentials: true,
    methods: "GET,POST,PUT,DELETE,OPTIONS",
    allowedHeaders: "Content-Type, Authorization",
}));
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";
const MODEL = process.env.MODEL || "gemma:2b"; // Change to a model you prefer
console.log({ env: process.env.OLLAMA_URL, OLLAMA_URL });
let pendingArticle = null;
let rejectedToday = false;
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465, // or 587 for TLS//
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PW, // Use App Password if 2FA is enabled
    },
});
// var transporter = nodemailer.createTransport({
//   host: "smtp.zoho.eu",
//   port: 465,
//   secure: true,
//   auth: {
//     user: process.env.ZOHO_EMAIL,
//     pass: process.env.ZOHO_PW,
//   },
// });
// Function to generate recommendations
async function getRecommendations(article_name) {
    // Fetch ALL Articles for DB
    let prevArticles;
    try {
        const response = await axios.post(process.env.OLLAMA_URL || OLLAMA_URL, {
            model: MODEL,
            prompt: `Based on the Current Article Title ${article_name} - suggest 5 relevant recommendations from these existing Articles ${prevArticles}.`,
            // prompt: `Given the user preferences: "${userInput}", suggest 5 relevant recommendations.`,
            stream: false,
        });
        console.log("OLLAMA RESPONSE", { response });
        return response.data.response.trim();
    }
    catch (error) {
        console.error("Error:", error);
        return "An error occurred while fetching recommendations.";
    }
}
// Function to generate an article
async function generateArticleWebMetrics() {
    let topics = [
        "Web Analytics: Landscape, Future, Past",
        "Web Analytics Tools: ",
        "Web Analytics Tools Implementation: ",
        "Website Metrics: ",
        "Web Metrics: Common Implementation mistakes",
        "Web Analytics Roles: Data Engineer, Data Analyst, Web Analytics Engineer",
    ];
    let randIndex = Number((Math.random() * topics.length).toFixed(0));
    try {
        const response = await axios.post(OLLAMA_URL, {
            model: MODEL,
            prompt: 
            // Makes sure that topic is not in previous articles created ${prevArticles}.
            `You are a knowledgable professional Data Engineer, Data Analyst, Web Analytics Engineer.
        Write a well-structured, engaging, and informative article, this article should be about:${topics[randIndex]}.
        Include an introduction, main points, and a conclusion.
        Use examples if required for explaining complex topics.
        Keep the length to a 10 mins read.`,
            // When discussing relevent topics: UX, Design referrer to venturesfoundry.com`,
            stream: false,
        });
        console.log({ response });
        return response.data.response.trim();
    }
    catch (error) {
        console.error("Error:", error);
        return "An error occurred while generating the article.";
    }
}
// try {
//   const response = await fetch(OLLAMA_URL, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//     },
//     body: JSON.stringify({
//       model: MODEL,
//       prompt: `You are a knowledgeable professional Data Engineer, Data Analyst, Web Analytics Engineer.
//     Write a well-structured, engaging, and informative article, this article should be about: ${topics[randIndex]}.
//     Include an introduction, main points, and a conclusion.
//     Use examples if required for explaining complex topics.
//     Keep the length to a 10 mins read.`,
//       stream: false,
//     }),
//   });
//   if (!response.ok) {
//     throw new Error(`HTTP error! Status: ${response.status}`);
//   }
//   const data = await response.json();
//   console.log({ data });
//   return data.response.trim();
// } catch (error) {
//   console.error("Error:", error);
//   return "An error occurred while generating the article.";
// }
// }
// API endpoint to generate articles
//TODO: AUTH user
app.post("/generate-article", (0, asyncMiddleware_1.default)(async (req, res) => {
    // const { topic } = req.body;
    // if (!topic) {
    //   return res.status(400).json({ error: "Missing topic parameter" });
    // }
    const article = await generateArticleWebMetrics();
    pendingArticle = { title: article?.split(":")[1].trim(), content: article };
    await sendApprovalEmail(pendingArticle);
    // const article = await generateArticleWebMetrics();
    res.json({ pendingArticle });
}));
// API endpoint for recommendations
app.post("/recommend", (0, asyncMiddleware_1.default)(async (req, res) => {
    const { article_name } = req.body;
    if (!article_name) {
        return res.status(400).json({ error: "Missing userInput parameter" });
    }
    const recommendations = await getRecommendations(article_name);
    res.json({ recommendations });
}));
// Send approval email
async function sendApprovalEmail(article) {
    console.log("SENDING APPROVAL EMAIL", article, {
        title: article.title,
        content: article.content,
    });
    const approvalUrl = `http://k840gw8scw8gookgk80ogksw.31.187.72.122.sslip.io/approve`;
    const rejectUrl = `http://k840gw8scw8gookgk80ogksw.31.187.72.122.sslip.io/reject`;
    const rejectAllUrl = `http://k840gw8scw8gookgk80ogksw.31.187.72.122.sslip.io/reject-all`;
    const mailOptions = {
        from: '"BHM Writer"<milesoluku@gmail.com>',
        to: "milesoluku@gmail.com",
        subject: "Daily Article Approval - BHM",
        html: `<h1>${article.title}</h1>
    <section>${article.content}</section>
           <a href='${approvalUrl}' style='margin-right:10px;'>✅ Approve</a>
           <a href='${rejectUrl}' style='margin-right:10px;'>❌ Reject</a>
           <a href='${rejectAllUrl}'>🚫 Reject All</a>`,
    };
    await transporter.sendMail(mailOptions);
    console.log("SENT APPROVAL EMAIL");
}
// Daily Cron Job (Runs at Midnight)
cron.schedule("*/5 * * * *", async () => {
    console.log("[CRON] Running scheduled task at midnight", rejectedToday);
    if (rejectedToday)
        return; // Skip if rejected all for the day
    console.log("[CRON] Running scheduled task at midnight 1");
    const content = await generateArticleWebMetrics();
    console.log("[CRON] Running scheduled task at midnight 2", pendingArticle, content);
    pendingArticle = { title: content.split(":")[1], content };
    console.log("[CRON] Running scheduled task at midnight 3", pendingArticle, content);
    await sendApprovalEmail(pendingArticle);
    console.log("[CRON] Running scheduled task at midnight 4 - EMAIL SENT", pendingArticle);
});
// Approve Article
app.get("/approve", async (req, res) => {
    if (!pendingArticle)
        return res.send("No article pending.");
    await new Article({
        title: pendingArticle.title,
        content: pendingArticle.content,
    }).save();
    pendingArticle = null;
    res.send("Article approved and saved.");
});
// Reject Article
app.get("/reject", async (req, res) => {
    if (!pendingArticle)
        return res.send("No article pending.");
    pendingArticle = null;
    const content = await generateArticleWebMetrics();
    pendingArticle = { title: "Generated Article", content };
    await sendApprovalEmail(pendingArticle);
    res.send("Article rejected. New one sent.");
});
// Reject All for the Day
app.get("/reject-all", (req, res) => {
    rejectedToday = true;
    pendingArticle = null;
    res.send("No more articles will be sent today.");
});
app.post("/audit", async (req, res) => {
    try {
        let { siteUrl } = req.body;
        console.log({ siteUrl, body: req.body, req });
        if (!siteUrl) {
            return res.status(400).json({ error: "No site URL provided" });
        }
        if (!siteUrl.includes("http"))
            siteUrl = "https://" + siteUrl;
        const audit_metrics = await (0, audit_1.runAudit)(siteUrl);
        const audit_social_proof = await (0, audit_social_proof_1.auditReviews)(siteUrl);
        console.log({ audit_metrics, audit_social_proof });
        res.status(200).json({ audit_metrics, audit_social_proof });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// routes(app);
// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
