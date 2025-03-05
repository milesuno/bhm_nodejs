import { runAudit } from "./controllers/audit";
import { auditReviews } from "./controllers/audit-social-proof";
import asyncMiddleware from "./middleware/asyncMiddleware";
import routes from "./routes";

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

const OLLAMA_URL = "http://0.0.0.0:11434/api/generate";
const MODEL = "gemma"; // Change to a model you prefer

let pendingArticle: any = null;
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
async function getRecommendations(article_name: any) {
  // Fetch ALL Articles for DB
  let prevArticles;
  try {
    const response = await axios.post(OLLAMA_URL, {
      model: MODEL,
      prompt: `Based on the Current Article Title ${article_name} - suggest 5 relevant recommendations from these existing Articles ${prevArticles}.`,
      // prompt: `Given the user preferences: "${userInput}", suggest 5 relevant recommendations.`,
      stream: false,
    });

    return response.data.response.trim();
  } catch (error) {
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

    return response.data.response.trim();
  } catch (error) {
    console.error("Error:", error);
    return "An error occurred while generating the article.";
  }
}

// API endpoint to generate articles
//TODO: AUTH user
app.post(
  "/generate-article",
  asyncMiddleware(async (req: any, res: any) => {
    // const { topic } = req.body;
    // if (!topic) {
    //   return res.status(400).json({ error: "Missing topic parameter" });
    // }
    const article = await generateArticleWebMetrics();
    pendingArticle = { title: article?.split(":")[1].trim(), content: article };
    await sendApprovalEmail(pendingArticle);

    // const article = await generateArticleWebMetrics();
    res.json({ pendingArticle });
  })
);

// API endpoint for recommendations
app.post(
  "/recommend",
  asyncMiddleware(async (req: any, res: any) => {
    const { article_name } = req.body;
    if (!article_name) {
      return res.status(400).json({ error: "Missing userInput parameter" });
    }

    const recommendations = await getRecommendations(article_name);
    res.json({ recommendations });
  })
);

// Send approval email
async function sendApprovalEmail(article: any) {
  const approvalUrl = `http://k840gw8scw8gookgk80ogksw.31.187.72.122.sslip.io/approve`;
  const rejectUrl = `http://k840gw8scw8gookgk80ogksw.31.187.72.122.sslip.io/reject`;
  const rejectAllUrl = `http://k840gw8scw8gookgk80ogksw.31.187.72.122.sslip.io/reject-all`;

  const mailOptions = {
    from: '"BHM Writer"<milesoluku@gmail.com>',
    to: "milesoluku@gmail.com",
    subject: "Daily Article Approval - BHM",
    html: `<h1>${article.title}</h1>${article.content
      .split("\n")
      .map((p: any) => "<p>" + { p } + "</p>")}
           <a href='${approvalUrl}' style='margin-right:10px;'>✅ Approve</a>
           <a href='${rejectUrl}' style='margin-right:10px;'>❌ Reject</a>
           <a href='${rejectAllUrl}'>🚫 Reject All</a>`,
  };
  await transporter.sendMail(mailOptions);
}

// Daily Cron Job (Runs at Midnight)
cron.schedule("0 0 * * *", async () => {
  if (rejectedToday) return; // Skip if rejected all for the day
  const content = await generateArticleWebMetrics();
  pendingArticle = { title: content.article.split(":")[1], content };
  await sendApprovalEmail(pendingArticle);
});

// Approve Article
app.get("/approve", async (req: any, res: any) => {
  if (!pendingArticle) return res.send("No article pending.");
  await new Article({
    title: pendingArticle.title,
    content: pendingArticle.content,
  }).save();
  pendingArticle = null;
  res.send("Article approved and saved.");
});

// Reject Article
app.get("/reject", async (req: any, res: any) => {
  if (!pendingArticle) return res.send("No article pending.");
  pendingArticle = null;
  const content = await generateArticleWebMetrics();
  pendingArticle = { title: "Generated Article", content };
  await sendApprovalEmail(pendingArticle);
  res.send("Article rejected. New one sent.");
});

// Reject All for the Day
app.get("/reject-all", (req: any, res: any) => {
  rejectedToday = true;
  pendingArticle = null;
  res.send("No more articles will be sent today.");
});

app.post("/audit", async (req: any, res: any) => {
  try {
    const { siteUrl } = req.body;
    if (!siteUrl) {
      return res.status(400).json({ error: "No site URL provided" });
    }

    const audit_metrics = await runAudit(siteUrl);
    const audit_social_proof = await auditReviews(siteUrl);

    res.status(200).json({ audit_metrics, audit_social_proof });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// routes(app);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
