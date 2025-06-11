"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const audit_1 = require("./controllers/audit");
const audit_social_proof_1 = require("./controllers/audit-social-proof");
const asyncMiddleware_1 = __importDefault(require("./middleware/asyncMiddleware"));
const cors_1 = __importDefault(require("cors"));
const formidable_1 = require("formidable");
const fs_1 = __importDefault(require("fs"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const mongodb_1 = require("mongodb");
const child_process_1 = require("child_process");
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
console.log({ env: process.env.OLLAMA_URL, OLLAMA_URL, MODEL });
let pendingArticle = null;
let pendingReviwedArticle = null;
let rejectedToday = false;
const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465, // or 587 for TLS//
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PW, // Use App Password if 2FA is enabled
    },
});
let promptRef;
let improvedArticle;
let vectorSearchResults;
// OLLAMA AGENTS
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
        // console.log("OLLAMA RESPONSE", { response });
        return response.data.response.trim();
    }
    catch (error) {
        console.error("Error:", error);
        return "An error occurred while fetching recommendations.";
    }
}
async function generateArticleWebMetrics() {
    let topics = [
        "Web Analytics: Current Landscape",
        "Web Analytics: Future Landscape (upcoming/new)",
        "Web Analytics: Past Landscape (histroy)",
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
        // "Web Analytics Tools: Legal Considerations",
        "Web Analytics Tools: Users Consent",
        // "Web Analytics Tools: Legal Considerations",
        "Web Analytics Tools Implementation: Adobe Analytics",
        "Web Analytics Tools Implementation: Google Tag Manager",
        "Web Analytics Tools Implementation: Google Analytics 4",
        "Web Analytics Tools Implementation: Tealium",
        "Web Analytics Tools Implementation: Hotjar",
        "Web Analytics Tools Implementation: Best Practices",
        // "Web Analytics Tools Implementation: Common Mistakes",
        "Web Analytics Tools Implementation: debugging",
        "Web Analytics Job Roles",
        // "Web Analytics Roles - Deep Dive: Data Analyst",
        "Web Analytics Roles - Deep Dive: Data Engineer",
        "Web Analytics Roles - Deep Dive: Web Analytics Engineer",
        "Web Analytics Metrics: Common used metrics and use cases",
        "Web Analytics Metrics: Business critical metrics",
        "Web Analytics Metrics: Business specific metrics",
        "Web Analytics Metrics: Common mistakes",
        // "Web Analytics Legal Considerations: Current landscape",
        // "Web Analytics Legal Considerations: Future landscape",
        // "Web Analytics Legal Considerations: Important legalisations",
        // "Web Analytics Legal Considerations: Upcoming legalisations",
        // "Web Analytics Legal Considerations: Tags",
        // "Web Analytics Legal Considerations: Consent",
        // "Web Analytics Legal Considerations: Locale Consent differences",
        // "Web Analytics Legal Considerations: company case study of failing to comply",
    ];
    let randIndex = Number((Math.random() * topics.length).toFixed(0));
    console.log(randIndex, topics[randIndex]);
    promptRef = topics[randIndex];
    const queryEmbedding = await embed(`${topics[randIndex]}`);
    // BUG: Will need data sources before new articles can be reliably generated
    let results = await WebPDFDoc.aggregate([
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
    let scanDocResults = await WebDoc.aggregate([
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
    scanDocResults.length < 0
        ? (results = results.push(...scanDocResults))
        : null;
    vectorSearchResults = results.join("\n\n");
    const context = results
        .map(async (doc) => {
        doc.summary ? doc.summary : doc.document ? doc.document : doc.text;
        // console.log("RESEARCH SUMMARISATION", { doc });
        // if (doc.document)
        // await promptBasedSummary(topics[randIndex], doc?.document);
        // if (doc.text) await promptBasedSummary(topics[randIndex], doc?.text);
        // (await promptBasedSummary(topics[randIndex], doc));
    })
        .join("\n\n");
    // console.log({ results, context, queryEmbedding });
    // TODO: Removed till Comfy UI is intergrated
    //   Title Image Description:
    //  Main point Image Description:
    const prompt = `      
  Create a well-structured, engaging, and informative article using this context and prompt. Include line breaks for formatting purposes. Provide references to each fact used in article.
  I also want you to add an approriate Title image description and main point image description for the article - the description should be detailed as it will be parsed to another model for image generation (descriptiosn should not be included in article total length).
  Article Format should following format: 
  
  Title:

  Introduction:
  
  Main point Image Description:

  main points:
  
  conclusion:
  
  Use examples if required for explaining complex topics.
  Keep the length to a 10 mins read.

Additional Context:
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
    }
    catch (error) {
        console.error("Error:", error);
        return "An error occurred while generating the article.";
    }
}
async function sentimentFinder(text) {
    const prompt = `Find the keywords from the following text that are relevant to make find relevant documents using Vector Embed Search. The result relevant keywords with a Maximum of 5 words:\n\n"${text}".`;
    const res = await axios.post(`${OLLAMA_URL}/api/generate`, {
        model: "mistral",
        prompt,
        stream: false,
    });
    return res.data.response.trim();
}
async function summarize(text) {
    const prompt = `Use the provided text to create upto 5 related facts (maximum 750 words) related to this following prompt:
    
  Here is the text to summarise:\n\n"${text}".
  
  Summary should follow this provided format:
  
  Topic Name #1:
  - 1. Fact #1
  - 2. Fact #2
  - 3. Fact #3
  - 4. Fact #4
  - 5. Fact #5

    Topic Name #2:
  - 1. Fact #1
  - 2. Fact #2
  - 3. Fact #3
  - 4. Fact #4
  - 5. Fact #5

  `;
    const res = await axios.post(`${OLLAMA_URL}/api/generate`, {
        model: MODEL,
        prompt,
        stream: false,
    });
    if (res)
        console.log({ Summary: res.data.response.trim() });
    return res.data.response.trim();
}
//TODO: Consider reprocessing DOC using this are Summarising agent
// This will lower compute at time of request
async function promptBasedSummary(text) {
    const new_prompt = `Use the provided text to create upto 5 topic related facts for each Topic found in the text (maximum 750 words).
    
  Here is the text to summarise:\n\n"${text}".

  EXCLUDE any Exercises provided in text from OUTPUT

  Summary should follow this provided format:
  
  Topic Name #1:
  - 1. Topic Related Fact #1
  - 2. Topic Related Fact #2
  - 3. Topic Related Fact #3

    Topic Name #2:
  - 1. Topic Related Fact #1
  - 2. Topic Related Fact #2
  - 3. Topic Related Fact #3

  `;
    const res = await axios.post(`${OLLAMA_URL}/api/generate`, {
        model: MODEL,
        prompt: new_prompt,
        stream: false,
    });
    if (res)
        console.log({ Summary: res.data.response.trim() });
    return res.data.response.trim();
}
async function factFinder(text) {
    const prompt = `Extract 5 to 10 key factual points from the following text content :\n\n"${text}"\n\n
  Each of the fact be number bullet points only - DO NOT include ANY facts the about: dedications, authors or writers. 
  DO NOT include any sub-bullet points in the bullet points list.
  
  Your OUTPUT should follow this structure
  "1. Fact#1, 2. Fact#2, 3. Fact#3, ..."
  `;
    const res = await axios.post(`${OLLAMA_URL}/api/generate`, {
        model: MODEL,
        prompt,
        stream: false,
    });
    return res.data.response.trim();
}
async function embed(text) {
    const res = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
        model: "nomic-embed-text",
        prompt: text,
    });
    return res.data.embedding;
}
function formatEmailTextToHTML(text) {
    // Convert bold (**text**) to <strong>
    // text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // Convert bullet points (* ) to <ul><li>
    text = text?.replace(/\n\* (.*?)(?=\n[^\*]|\n$)/g, "\n<li>$1</li>");
    text = text?.replace(/(<li>.*<\/li>)/gs, "<ul>$1</ul>");
    // Convert numbered lists (1. ) to <ol><li>
    // text = text.replace(/\n\d+\. (.*?)(?=\n\d+\.|\n\n|\n$)/g, "\n<li>$1</li>");
    // text = text.replace(/(<li>.*<\/li>)/gs, "<ol>$1</ol>");
    // Convert line breaks
    text = text?.replace(/\n{2,}/g, "</p><p>"); // Paragraphs
    text = "<p>" + text + "</p>"; // Wrap all in a paragraph
    text = text?.replace(/\n/g, "<br>"); // Single line breaks
    // Replace known section titles with <h2>
    text = text?.replace(/\*\*Introduction:\*\*/g, "<h2>Introduction</h2>");
    text = text?.replace(/\*\*Main points:\*\*/gi, "<h2>Main Points</h2>");
    text = text?.replace(/\*\*Conclusion:\*\*/g, "<h2>Conclusion</h2>");
    text = text?.replace(/\*\*Suggestions:\*\*/g, "<h2>Suggestions</h2>");
    text = text?.replace(/\*\*Improved Article:\*\*/g, "<h2>Improved Article</h2>");
    text = text?.replace(/\*\*Title:\*\*/g, "<h2>Title</h2>");
    text = text?.replace(/\*\*Title Image Description:\*\*/g, "<h2>Title Image Description</h2>");
    text = text?.replace(/\*\*Main point Image Description:\*\*/g, "<h2>Main Point Image Description</h2>");
    text = text?.replace(/\*\*References:\*\*/g, "<h3>References</h3>");
    return text;
}
async function sendApprovalEmail(article) {
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
        html: `
    <h1>${article.title}</h1>
    <h2>Article:</h2>

    <section>${formatEmailTextToHTML(article.content)}</section>

    <div>
    <a href='${approvalUrl}/${article._id}' style='margin-right:10px;'>✅ Approve</a>
    <a href='${rejectUrl}' style='margin-right:10px;'>❌ Reject</a>
    <a href='${rejectAllUrl}'>🚫 Reject All</a>
    </div>

    <hr/>
    
    <h2>Article Review:</h2>
    
    <section>${formatEmailTextToHTML(improvedArticle.content)}</section>

    <div>
    <a href='${approvalUrl}/${improvedArticle._id}' style='margin-right:10px;'>✅ Approve</a>
    <a href='${rejectUrl}' style='margin-right:10px;'>❌ Reject</a>
    <a href='${rejectAllUrl}'>🚫 Reject All</a>
    </div>

           `,
    };
    await transporter.sendMail(mailOptions);
    console.log("SENT APPROVAL EMAIL");
}
async function articleReviewer(article) {
    try {
        const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: MODEL,
            prompt: `Based on this prompt: ${promptRef} how well does this article cover the topic? Rate it between 0-1. This is the article to review: ${article}. 
      Create a improved verison of the article based on your suggestions. 

      Output:

      Suggestions

      Improved Article
      `,
            stream: false,
        });
        // console.log("OLLAMA RESPONSE", { response });
        return response.data.response.trim();
    }
    catch (error) {
        console.error("Error:", error);
        return "An error occurred while reviewing.";
    }
}
async function articleFactChecker(article) {
    try {
        const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
            model: MODEL,
            prompt: `Review this article throughly and fact check the information in the article using the provide context.


      Article to review: ${article}.
      Context: ${vectorSearchResults}
      
      Expected output format:

      Review: 

      Facts:

      References:
      `,
            stream: false,
        });
        // console.log("OLLAMA RESPONSE", { response });
        vectorSearchResults = undefined;
        return response.data.response.trim();
    }
    catch (error) {
        console.error("Error:", error);
        return "An error occurred while reviewing.";
    }
}
// BOTS
async function crawlWebsite(url) {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2" });
    const title = await page.title();
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim());
    await browser.close();
    return { title, text };
}
// Daily Cron Job (Runs at Midnight)
cron.schedule("0 0 * * *", async () => {
    console.log("[CRON] Running scheduled task at midnight", rejectedToday);
    if (rejectedToday)
        return; // Skip if rejected all for the day
    console.log("[CRON] Running scheduled task at midnight 1");
    const content = await generateArticleWebMetrics();
    console.log("[CRON] Running scheduled task at midnight 2", pendingArticle, content);
    pendingArticle = {
        _id: new mongodb_1.ObjectId(),
        title: content.includes("**Title:**")
            ? content.split("**Title:**")[1].split("\n\n")[0]
            : content?.split("\n\n")[1],
        content: content.includes("**Title:**")
            ? content?.split("\n\n").slice(1).join("\n\n")
            : content?.split("\n\n").slice(1).join("\n\n"),
        creation: Date.now(),
    };
    console.log("[CRON] Running scheduled task at midnight 3", pendingArticle, content);
    await sendApprovalEmail(pendingArticle);
    console.log("[CRON] Running scheduled task at midnight 4 - EMAIL SENT", pendingArticle);
});
// DATA SOURCING
app.post("/scrape", (0, asyncMiddleware_1.default)(async (req, res) => {
    try {
        const { url } = req.body;
        console.log("/scrape - title, text", url);
        const { title, text } = await crawlWebsite(url);
        console.log("/scrape - title, text", title, text);
        const facts = await factFinder(text);
        const summary = await promptBasedSummary(text);
        console.log("/scrape - text", text);
        const vector_facts = await embed(facts);
        const vector_doc = await embed(text);
        console.log("/scrape - summary", facts);
        let doc = new WebDoc({
            url,
            title,
            text,
            summary,
            facts: facts.split("\n"),
            embedding_facts: vector_facts,
            embedding_text: vector_doc,
        });
        console.log({ doc });
        await doc.save();
        res.status(200).send({ message: "Saved", doc, facts: doc.facts });
    }
    catch (err) {
        console.error(err);
        res.status(500).send("Error scraping and saving");
    }
}));
app.post("/upload", (0, asyncMiddleware_1.default)(async (req, res) => {
    console.log({ req });
    // if (req.method !== "POST") return res.status(405).end();
    // await connectMongo();
    const form = new formidable_1.IncomingForm({ keepExtensions: true });
    // console.log({ form });
    form.parse(req, async (err, fields, files) => {
        const file = files.file[0];
        const dataBuffer = fs_1.default.readFileSync(file.filepath);
        const parsed = await (0, pdf_parse_1.default)(dataBuffer);
        const title = file.originalFilename;
        // const chunks = chunkText(parsed.text);
        const summary = await promptBasedSummary(parsed.text);
        const keyFacts = await factFinder(parsed.text);
        const embedding_facts = await embed(keyFacts);
        const embedding_summary = await embed(summary);
        const embedding_text = await embed(parsed.text);
        console.log({
            title,
            text: parsed.text,
            // summary,
            // keyFacts,
            // embedding_facts,
            // embedding_summary,
            // embedding_text,
        });
        // convert to model
        await new WebPDFDoc({
            title,
            // page: i + 1,
            text: parsed.text,
            summary,
            facts: keyFacts.split("\n"),
            embedding_facts,
            embedding_text,
            embedding_summary,
        }).save();
        console.log({ WebPDFDoc });
        // await documents.insertMany(vectorDocs);
        res.json({ message: "Uploaded and embedded", chunks: WebPDFDoc.length });
    });
}));
// OLLAMA ROUTES
app.post("/generate-article", (0, asyncMiddleware_1.default)(async (req, res) => {
    // const { topic } = req.body;
    // if (!topic) {
    //   return res.status(400).json({ error: "Missing topic parameter" });
    // }
    const article = await generateArticleWebMetrics();
    pendingArticle = {
        _id: new mongodb_1.ObjectId(),
        title: article.includes("**Title:**")
            ? article.split("**Title:**")[1].split("\n\n")[0]
            : article?.split("\n\n")[1],
        content: article.includes("**Title:**")
            ? article?.split("\n\n").slice(1).join("\n\n")
            : article?.split("\n\n").slice(1).join("\n\n"),
        creation: Date.now(),
    };
    let review = await articleReviewer(article);
    pendingReviwedArticle = {
        _id: new mongodb_1.ObjectId(),
        title: review.includes("**Improved Article:**") &&
            review.includes("**Title:**")
            ? review
                .split("**Improved Article:**")[1]
                .split("**Title:**")[1]
                .split("\n\n")[0]
            : review.split("\n\n")[1],
        content: review.split("\n\n").slice(3).join("\n\n"),
        creation: Date.now(),
    };
    let factCheck = await articleFactChecker(article);
    //Delete?
    improvedArticle = pendingReviwedArticle;
    console.log({ review, factCheck });
    await sendApprovalEmail(pendingArticle);
    // const article = await generateArticleWebMetrics();
    res
        .status(200)
        .send({ pendingArticle, facts: pendingArticle.facts, review });
}));
app.post("/recommend", (0, asyncMiddleware_1.default)(async (req, res) => {
    const { article_name } = req.body;
    if (!article_name) {
        return res.status(400).json({ error: "Missing userInput parameter" });
    }
    const recommendations = await getRecommendations(article_name);
    res.json({ recommendations });
}));
// ARTICLE GENERATION
app.get("/approve/:id", (0, asyncMiddleware_1.default)(async (req, res) => {
    if (!pendingArticle || !improvedArticle)
        return res.send("No article pending.");
    console.log({
        params: req.params.id,
        id1: pendingArticle._id,
        id2: improvedArticle._id,
    });
    if (pendingArticle._id == req.params.id)
        await new Article({
            title: pendingArticle?.title,
            content: pendingArticle?.content,
        }).save();
    if (improvedArticle._id == req.params.id)
        await new Article({
            title: improvedArticle?.title,
            content: improvedArticle?.content,
        }).save();
    res.send("Article approved and saved:" + pendingArticle?.content);
    pendingArticle = null;
    improvedArticle = null;
}));
app.get("/reject", (0, asyncMiddleware_1.default)(async (req, res) => {
    if (!pendingArticle)
        return res.send("No article pending.");
    pendingArticle = null;
    pendingReviwedArticle = null;
    const content = await generateArticleWebMetrics();
    const reviewedArticle = await articleReviewer(content);
    pendingArticle = content;
    pendingReviwedArticle = reviewedArticle;
    await sendApprovalEmail(pendingArticle);
    res.send("Article rejected. New one sent.");
}));
app.get("/reject-all", (0, asyncMiddleware_1.default)(async (req, res) => {
    rejectedToday = true;
    pendingArticle = null;
    res.send("No more articles will be sent today.");
}));
// BOTS ROUTES
app.post("/audit", (0, asyncMiddleware_1.default)(async (req, res) => {
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
}));
app.post("/crawl", (0, asyncMiddleware_1.default)(async (req, res) => {
    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }
    let { url, dataLayer } = req.body;
    if (!url.includes("https://"))
        url = "https://" + url;
    console.log({ url, dataLayer });
    if (!url || !dataLayer) {
        return res
            .status(400)
            .json({ message: "URL and DataLayer name are required." });
    }
    // Run the Node.js script
    const process = (0, child_process_1.spawn)("node", ["crawlDataLayer.js", url, dataLayer]);
    let output = "";
    process.stdout.on("data", (data) => {
        output += data.toString();
    });
    process.stderr.on("data", (data) => {
        console.error("Error:", data.toString());
    });
    process.on("close", (code) => {
        console.log({ code });
        if (code === 0) {
            console.log({ output });
            try {
                const fileContents = fs_1.default.readFileSync("datalayer_report.json", "utf8");
                const json = JSON.parse(fileContents);
                // const result = JSON.parse(output);
                console.log({ json }); // => { message: "done" }
                return res.status(200).json(json);
            }
            catch (error) {
                return res.status(500).json({ message: "Error parsing result." });
            }
        }
        else {
            return res.status(500).json({ message: "Script execution failed." });
        }
    });
}));
// BLOG API
app.get("/article/:_id", (0, asyncMiddleware_1.default)(async (req, res) => {
    let article = await Article.findOne({ _id: req.params._id }).exec();
    if (!article || article.length <= 0)
        return res.status(404).send("No Article found.");
    return res.status(200).json(article);
}));
app.get("/articles", (0, asyncMiddleware_1.default)(async (req, res) => {
    let article = await Article.find({});
    if (!article || article.length <= 0)
        return res.status(404).send("No Article found.");
    return res.status(200).json(article);
}));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
