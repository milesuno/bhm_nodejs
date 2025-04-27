import { runAudit } from "./controllers/audit";
import { auditReviews } from "./controllers/audit-social-proof";
import asyncMiddleware from "./middleware/asyncMiddleware";
import routes from "./routes";
import cors from "cors";
import { IncomingForm } from "formidable";
import fs from "fs";
import pdfParse from "pdf-parse";


require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cron = require("node-cron");
const app = express();
const nodemailer = require("nodemailer");
const puppeteer = require("puppeteer");
const Article = require("./models/article");
const WebDoc = require("./models/doc-ref");
const WebPDFDoc = require("./models/doc-pdf");


app.use(express.json());

app.use((req: any, res: any, next: any) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Expose-Headers", "x-auth-token");
  next();
});

app.use(
  cors({
    origin: "*", // Change to your frontend domain
    credentials: true,
    methods: "GET,POST,PUT,DELETE,OPTIONS",
    allowedHeaders: "Content-Type, Authorization",
  })
);

const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate";
const MODEL = process.env.MODEL || "gemma:2b"; // Change to a model you prefer
console.log({ env: process.env.OLLAMA_URL, OLLAMA_URL, MODEL });
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

// OLLAMA AGENTS
async function getRecommendations(article_name: any) {
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
  } catch (error) {
    console.error("Error:", error);
    return "An error occurred while fetching recommendations.";
  }
}

async function generateArticleWebMetrics() {
  let topics = [
    "Web Analytics: Current Landscape",
    "Web Analytics:  Future Landscape",
    "Web Analytics: Past Landscape",
    "Web Analytics: Web Analytics vs Analytics",
    "Web Analytics: Web Analytics vs Analytics vs Statistics",
    "Web Analytics: Web Analytics vs Statistics",
    "Web Analytics: Web Analytics vs Statistics - how much stats do you need to know",
    "Web Analytics: Statistics in Web Analytics",
    //TODO: ADD Tool Spotlight
    "Web Analytics Tools: Web Analytics Tag Types",
    "Web Analytics Tools: Types",
    "Web Analytics Tools: A company user case example",
    "Web Analytics Tools: Landscape",
    "Web Analytics Tools: Legal Considerations",
    "Web Analytics Tools: Users Consent",
    "Web Analytics Tools: Legal Considerations",
    "Web Analytics Tools Implementation: Adobe Analytics",
    "Web Analytics Tools Implementation: Google Tag Manager",
    "Web Analytics Tools Implementation: Google Analytics 4",
    "Web Analytics Tools Implementation: Tealium",
    "Web Analytics Tools Implementation: Hotjar",
    "Web Analytics Tools Implementation: Best Practices",
    "Web Analytics Tools Implementation: Common Mistakes",
    "Web Analytics Tools Implementation: debugging",
    "Web Analytics Job Roles",
    "Web Analytics Roles: Data Engineer",
    "Web Analytics Roles: Data Analyst",
    "Web Analytics Roles: Web Analytics Engineer",
    "Web Analytics Metrics: Common used metrics and use cases",
    "Web Analytics Metrics: Business critical metrics",
    "Web Analytics Metrics: Business specific metrics",
    "Web Analytics Metrics: Common mistakes",
    "Web Analytics Legal Considerations: Current landscape",
    "Web Analytics Legal Considerations: Future landscape",
    "Web Analytics Legal Considerations: Important legalisations",
    "Web Analytics Legal Considerations: Upcoming legalisations",
    "Web Analytics Legal Considerations: Tags",
    "Web Analytics Legal Considerations: Consent",
    "Web Analytics Legal Considerations: Locale Consent differences",
    "Web Analytics Legal Considerations: company case study of failing to comply",
  ];

  let randIndex = Number((Math.random() * topics.length).toFixed(0));
  console.log(randIndex, topics[randIndex]);
  const queryEmbedding = await embed(`${topics[randIndex]}`);

  // BUG: Will need data sources before new articles can be reliably generated
  let results = await WebDoc.aggregate([
    {
      $vectorSearch: {
        queryVector: queryEmbedding,
        path: "embedding_text",
        numCandidates: 100,
        limit: 5,
        index: "embed", // replace with your Atlas vector index name
      },
    },
  ]);

  results.length === 0
    ? (results = await WebDoc.aggregate([
        {
          $vectorSearch: {
            queryVector: queryEmbedding,
            path: "embedding",
            numCandidates: 100,
            limit: 5,
            index: "embed", // replace with your Atlas vector index name
          },
        },
      ]))
    : await WebPDFDoc.aggregate([
        {
          $vectorSearch: {
            queryVector: queryEmbedding,
            path: "embedding_text",
            numCandidates: 100,
            limit: 5,
            index: "embed_pdf", // replace with your Atlas vector index name
          },
        },
      ]);

  const context = results.map((doc: any) => doc.document).join("\n\n");
  console.log({ results, context, queryEmbedding });
  const prompt = `
  You are a knowledgable professional Data Engineer, Data Analyst, Web Analytics Engineer.        
        
  Write a well-structured, engaging, and informative article based on this context and prompt.
  Include an introduction, main points, and a conclusion.
  Use examples if required for explaining complex topics.
  Keep the length to a 10 mins read.

Context:
${context}

Prompt:
${topics[randIndex]}
`;
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: MODEL,
      prompt,
      // Makes sure that topic is not in previous articles created ${prevArticles}.,
      // When discussing relevent topics: UX, Design referrer to venturesfoundry.com`,
      stream: false,
    });

    console.log({ response });

    return response.data.response.trim();
  } catch (error) {
    console.error("Error:", error);
    return "An error occurred while generating the article.";
  }
}

async function summarize(text: any) {
  const prompt = `Summarize the main points of this text in upto 750 words from the following text:\n\n"${text}".`;
  const res = await axios.post(`${OLLAMA_URL}/api/generate`, {
    model: "mistral",
    prompt,
    stream: false,
  });
  return res.data.response.trim();
}

async function factFinder(text: any) {
  const prompt = `Extract 5 to 10 key factual points from the following text content :\n\n"${text}"\n\nEach of the fact be number bullet points only - DO NOT include ANY facts the about: dedications, authors or writers. DO NOT include any sub-bullet points in the bullet points list.`;
  const res = await axios.post(`${OLLAMA_URL}/api/generate`, {
    model: "mistral",
    prompt,
    stream: false,
  });
  return res.data.response.trim();
}

async function embed(text: any) {
  const res = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
    model: "nomic-embed-text",
    prompt: text,
  });
  return res.data.embedding;
}

async function sendApprovalEmail(article: any) {
  console.log("SENDING APPROVAL EMAIL", article, {
    title: article.title,
    content: article.content,
  });
  const approvalUrl = `https://api.businesshealthmetrics.com/approve`;
  const rejectUrl = `https://api.businesshealthmetrics.com/reject`;
  const rejectAllUrl = `https://api.businesshealthmetrics.com/reject-all`;

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

// BOTS
async function crawlWebsite(url: any) {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle2" });

  const title = await page.title();
  const text = await page.evaluate(() =>
    document.body.innerText.replace(/\s+/g, " ").trim()
  );

  await browser.close();
  return { title, text };
}

// Daily Cron Job (Runs at Midnight)
cron.schedule("0 0 * * *", async () => {
  console.log("[CRON] Running scheduled task at midnight", rejectedToday);
  if (rejectedToday) return; // Skip if rejected all for the day
  console.log("[CRON] Running scheduled task at midnight 1");

  const content = await generateArticleWebMetrics();
  console.log(
    "[CRON] Running scheduled task at midnight 2",
    pendingArticle,
    content
  );

  pendingArticle = { title: content.split(":")[1], content };
  console.log(
    "[CRON] Running scheduled task at midnight 3",
    pendingArticle,
    content
  );
  await sendApprovalEmail(pendingArticle);
  console.log(
    "[CRON] Running scheduled task at midnight 4 - EMAIL SENT",
    pendingArticle
  );
});


// DATA SOURCING
app.post(
  "/scrape",
  asyncMiddleware(async (req: any, res: any) => {
    try {
      const { url } = req.body;
      console.log("/scrape - title, text", url);
      const { title, text } = await crawlWebsite(url);
      console.log("/scrape - title, text", title, text);
      const facts = await factFinder(text);
      console.log("/scrape - text", text);

      const vector_facts = await embed(facts);
      const vector_doc = await embed(text);

      console.log("/scrape - summary", facts);

      let doc = new WebDoc({
        url,
        title,
        document: text,
        facts: facts.split("\n"),
        embedding_facts: vector_facts,
        embedding_text: vector_doc,
      });
      console.log({ doc });
      await doc.save();
      res.status(200).send({ message: "Saved", doc });
    } catch (err) {
      console.error(err);
      res.status(500).send("Error scraping and saving");
    }
  })
);

app.post(
  "/upload",
  asyncMiddleware(async (req: any, res: any) => {
    console.log({ req });
    // if (req.method !== "POST") return res.status(405).end();

    // await connectMongo();

    const form = new IncomingForm({ keepExtensions: true });
    console.log({ form });

    form.parse(req, async (err: any, fields: any, files: any) => {
      const file = files.file[0];
      const dataBuffer = fs.readFileSync(file.filepath);
      const parsed = await pdfParse(dataBuffer);

      const title = file.originalFilename;
      // const chunks = chunkText(parsed.text);
      const summary = await summarize(parsed.text);
      const keyFacts = await factFinder(parsed.text);

      const embedding_facts = await embed(keyFacts);
      const embedding_summary = await embed(summary);
      const embedding_text = await embed(parsed.text);

      console.log({
        title,
        summary,
        keyFacts,
        embedding_facts,
        embedding_summary,
        embedding_text,
      });

      // convert to model
      await new WebPDFDoc({
        title,
        // page: i + 1,
        text: parsed.text,
        summary,
        facts: keyFacts.split("\n"),
        embedding_facts: embedding_facts,
        embedding_text: embedding_text,
        embedding_summary,
      }).save();

      console.log({ WebPDFDoc });

      // await documents.insertMany(vectorDocs);
      res.json({ message: "Uploaded and embedded", chunks: WebPDFDoc.length });
    });
  })
);

// OLLAMA ROUTES
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
    res.status(200).send({ pendingArticle });
  })
);

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

// ARTICLE GENERATION
app.get("/approve", async (req: any, res: any) => {
  if (!pendingArticle) return res.send("No article pending.");
  await new Article({
    title: pendingArticle.title,
    content: pendingArticle.content,
  }).save();
  pendingArticle = null;
  res.send("Article approved and saved.");
});

app.get("/reject", async (req: any, res: any) => {
  if (!pendingArticle) return res.send("No article pending.");
  pendingArticle = null;
  const content = await generateArticleWebMetrics();
  pendingArticle = { title: "Generated Article", content };
  await sendApprovalEmail(pendingArticle);
  res.send("Article rejected. New one sent.");
});

app.get("/reject-all", (req: any, res: any) => {
  rejectedToday = true;
  pendingArticle = null;
  res.send("No more articles will be sent today.");
});


// BOTS ROUTES
app.post("/audit", async (req: any, res: any) => {
  try {
    let { siteUrl } = req.body;
    console.log({ siteUrl, body: req.body, req });
    if (!siteUrl) {
      return res.status(400).json({ error: "No site URL provided" });
    }

    if (!siteUrl.includes("http")) siteUrl = "https://" + siteUrl;

    const audit_metrics = await runAudit(siteUrl);
    const audit_social_proof = await auditReviews(siteUrl);

    console.log({ audit_metrics, audit_social_proof });

    res.status(200).json({ audit_metrics, audit_social_proof });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
