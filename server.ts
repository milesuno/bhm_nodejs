import { runAudit } from "./controllers/audit";
import { auditReviews } from "./controllers/audit-social-proof";
import asyncMiddleware from "./middleware/asyncMiddleware";
import routes from "./routes";
import cors from "cors";
import { IncomingForm } from "formidable";
import fs from "fs";
import pdfParse from "pdf-parse";
import { ObjectId } from "mongodb";
import { spawn } from "child_process";

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
let pendingReviewedArticle: any = null;
let rejectedToday = false;

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465, // or 587 for TLS//
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PW, // Use App Password if 2FA is enabled
  },
});
let promptRef: any;
let vectorSearchResults: any;
let factCheck: any;

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
    // console.log("OLLAMA RESPONSE", { response });
    return response.data.response.trim();
  } catch (error) {
    console.error("Error:", error);
    return "An error occurred while fetching recommendations.";
  }
}

function markdownToHtml(markdown: string): string {
  return (
    markdown
      // Headings
      .replace(/^### (.*$)/gim, "<h3>$1</h3>")
      .replace(/^## (.*$)/gim, "<h2>$1</h2>")
      .replace(/^# (.*$)/gim, "<h1>$1</h1>")

      // Bold & Italics
      .replace(/\*\*\*(.*?)\*\*\*/gim, "<strong><em>$1</em></strong>")
      .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/gim, "<em>$1</em>")

      // Inline code
      .replace(/`(.*?)`/gim, "<code>$1</code>")

      // Links
      .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2">$1</a>')

      // Line breaks
      .replace(/\n$/gim, "<br />")

      // Lists
      .replace(/^\- (.*$)/gim, "<li>$1</li>")
      .replace(/(<li>.*<\/li>)/gim, "<ul>$1</ul>") // Wrap single list items with <ul>

      // Paragraphs
      .replace(/^\s*([^<\n][^\n]+)\s*$/gm, "<p>$1</p>")

      .trim()
  );
}

async function articlePlanner(topic: any, context: any) {
  console.log("Article Planner", { topic });
  let prompt = `
  Create a DETAILED Plan for an article. Use the follow as the Article topic "${topic}". 

  Use the following data as context for your research when creating the article plan - add an index of references of the facts included in article plan: 
  ${context} 

  OUTPUT Should in this format:
  Title

  Introduction
  
  Article Body
  
  Conclusion

  References

  EXCLUDE: All reference to "Chapter".

  EXCLUDE: All reference to Author, Publishing, Production  of text from Article Body.

  `;

  try {
    console.log("RUN MODEL", "deepseek-r1:8b-llama-distill-q4_K_M ");
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: "deepseek-r1:8b-llama-distill-q4_K_M",
      prompt,
      // Makes sure that topic is not in previous articles created ${prevArticles}.,
      // When discussing relevent topics: UX, Design referrer to venturesfoundry.com`,
      stream: false,
    });
    // for (let chunk in response) {
    //   console.log({ chunk });
    // }
    console.log({ response });

    // loop on response an console chunks

    return response.data.response.trim();
  } catch (error) {
    console.error("Error:", error);
    return "An error occurred while generating the article.";
  }
}

async function generateArticleWebMetrics(reqPrompt = undefined) {
  console.log("generateArticleWebMetrics");
  let MD =
    'Markdown Guide Markdown Cheat Sheet A quick reference to the Markdown syntax. Overview This Markdown cheat sheet provides a quick overview of all the Markdown syntax elements. It can’t cover every edge case, so if you need more information about any of these elements, refer to the reference guides for basic syntax and extended syntax. Basic Syntax These are the elements outlined in John Gruber’s original design document. All Markdown applications support these elements. Element Markdown Syntax Heading # H1 ## H2 ### H3 Bold **bold text** Italic *italicized text* Blockquote > blockquote Ordered List 1. First item 2. Second item 3. Third item Unordered List - First item - Second item - Third item Code `code` Horizontal Rule --- Link [title](https://www.example.com) Image ![alt text](image.jpg) Extended Syntax These elements extend the basic syntax by adding additional features. Not all Markdown applications support these elements. Element Markdown Syntax Table | Syntax | Description | | ----------- | ----------- | | Header | Title | | Paragraph | Text | Fenced Code Block ``` { "firstName": "John", "lastName": "Smith", "age": 25 } ``` Footnote Here\'s a sentence with a footnote. [^1] [^1]: This is the footnote. Heading ID ### My Great Heading {#custom-id} Definition List term : definition Strikethrough ~~The world is flat.~~ Task List - [x] Write the press release - [ ] Update the website - [ ] Contact the media Emoji (see also Copying and Pasting Emoji) That is so funny! :joy: Highlight I need to highlight these ==very important words==. Subscript H~2~O Superscript X^2^';
  try {
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
    promptRef = topics[randIndex];
    console.log(randIndex, { promptRef });
    const queryEmbedding = await embed(`${promptRef}`);

    // console.log({ queryEmbedding });

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
    // console.log({ results });

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

    // console.log({ results, scanDocResults });

    scanDocResults.length < 0
      ? (results = results.push(...scanDocResults))
      : null;

    // vectorSearchResults = results.join("\n\n");

    console.log({ results, scanDocResults });
    vectorSearchResults = results
      .map((doc: any) => {
        console.log("RESEARCH SUMMARISATION", { doc: doc.title });
        return doc.summary
          ? doc.summary
          : doc.document
          ? doc.document
          : doc.text;
        // if (doc.document)
        // await promptBasedSummary(topics[randIndex], doc?.document);
        // if (doc.text) await promptBasedSummary(topics[randIndex], doc?.text);
        // (await promptBasedSummary(topics[randIndex], doc));
      })
      .join("\n\n");
    // console.log({ results, vectorSearchResults });

    // TODO: Removed till Comfy UI is intergrated
    //   Title Image Description:
    //  Main point Image Description:
    // let articlePlan = await articlePlanner(promptRef, vectorSearchResults);
    // console.log({ articlePlan });
    // OUTPUT -> Prompt
    const prompt = `      
  ROLE:
  You are a Writer for Business Health Metrics (BHM) - a Web Analytics Implementation and Consultancy Company. Your job is create helpful and insightful articles.  
  
  You should add Business Health Metrics "Call to Action" Links (CTA Links) in the Article using MarkDown. 
  
  The articles should be informative and promotional for Business Health Metrics (BHM).
  
  WHEN topics are complex add a embedded LINK Call to Action (CTA) for www.BusinessHealthMetrics.com using Markdown Syntax- use the APPROPRIATE BHM Web Analytics service related to the topic of the embedded link - Business Health Metrics (BHM) services are: 
    - For Consultancy use URL:  https://www.businesshealthmetrics.com/consultancy
    - For Implementation use URL: https://www.businesshealthmetrics.com/implrmentation
    - For Implementation Retainer use URL: https://www.businesshealthmetrics.com/retainer
    - For General Enquiries use URL: https://www.businesshealthmetrics.com/contact
    - FREE Web Anlaytics Tool Scanner use URL: https://www.businesshealthmetrics.com/free-website-audit
    - FREE Data Layer Scanner Anlaytics use URL: https://www.businesshealthmetrics.com/datalayer-scanner
   
  REQUIREMENTS:
  Create a well-structured, engaging, and informative article using this context and prompt. 
  Context:
  ${vectorSearchResults}

  Prompt:
  ${reqPrompt || promptRef}

  I also want you to add an approriate Title image description and main point image description for the article - the description should be detailed as it will be parsed to another model for image generation (descriptsion should not be included in article total length).
  

  The Article should use Markdown for syntax - here is a cheatsheet for Markdown:
  ${MD}

  The Article should contain Markdown Embedded "Call to Action"  with Links for Business Health Metrics (BHM) services: Consultancy, Implementation, Implementation Retainer - URLS to Embed: https://www.businesshealthmetrics.com.


  Use examples if required for explaining complex topics.

  Keep the length to a 10 mins read.


  EXPECTED OUTPUT:
  Title

  Introduction
  
  Article Body (with CTA)

  Real Life Application
  
  Conclusion

  EXCLUDE: All reference to "Chapter".
  EXCLUDE: All reference to Author, Publishing, Production  of text from Article Body.

  REMOVE: Number from each point in Article Body.

`;

    console.log("RUN MODEL", MODEL);
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: "gemma3:12b-it-q4_K_M",
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
async function sentimentFinder(text: any) {
  const prompt = `Find the keywords from the following text that are relevant to make find relevant documents using Vector Embed Search. The result relevant keywords with a Maximum of 5 words:\n\n"${text}".`;
  const res = await axios.post(`${OLLAMA_URL}/api/generate`, {
    model: "mistral",
    prompt,
    stream: false,
  });
  return res.data.response.trim();
}

async function summarize(text: any) {
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
  if (res) console.log({ Summary: res.data.response.trim() });

  return res.data.response.trim();
}

//TODO: Consider reprocessing DOC using this are Summarising agent
// This will lower compute at time of request
async function promptBasedSummary(text: any) {
  const new_prompt = `Use the provided text to create upto 5000 word summary. 
  Here is the text to summarise:\n\n"${text}".

  EXCLUDE from Summary:
  - any workbook Exercises provided in text from OUTPUT
  - any information that is not related to the text subject: Author, Publishing details, etc.
  `;

  const res = await axios.post(`${OLLAMA_URL}/api/generate`, {
    model: "deepseek-r1:8b-0528-qwen3-q4_K_M",
    prompt: new_prompt,
    stream: false,
  });
  if (res) console.log({ Summary: res.data.response.trim() });
  return res.data.response.trim();
}

async function factFinder(text: any) {
  const prompt = `
  INSTRUCTIONS:
  Extract 5 to 10 key factual points from the following text content :\n\n"${text}"\n\n
  Each of the fact be number bullet points only.
  
  EXCLUSIONS:
  DO NOT include ANY facts the about: dedications, authors or writers. 
  DO NOT include any sub-bullet points in the bullet points list.
  
  EXPECTED OUTPUT:
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

async function embed(text: any) {
  const res = await axios.post(`${OLLAMA_URL}/api/embeddings`, {
    model: "nomic-embed-text",
    prompt: text,
  });
  return res.data.embedding;
}

function formatEmailTextToHTML(text: any) {
  console.log("formatEmailTextToHTML");

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
  text = text?.replace(
    /\*\*Improved Article:\*\*/g,
    "<h2>Improved Article</h2>"
  );
  text = text?.replace(/\*\*Title:\*\*/g, "<h2>Title</h2>");
  text = text?.replace(
    /\*\*Title Image Description:\*\*/g,
    "<h2>Title Image Description</h2>"
  );
  text = text?.replace(
    /\*\*Main point Image Description:\*\*/g,
    "<h2>Main Point Image Description</h2>"
  );
  text = text?.replace(/\*\*References:\*\*/g, "<h3>References</h3>");
  console.log("DONE formatEmailTextToHTML");

  return text;
}

async function sendApprovalEmail(article: any) {
  console.log("SENDING APPROVAL EMAIL", article, {
    title: article?.title,
    content: article?.content,
    pendingReviewedArticle: pendingReviewedArticle?.content,
  });
  const approvalUrl = `https://api.businesshealthmetrics.com/approve`;
  const rejectUrl = `https://api.businesshealthmetrics.com/reject`;
  const rejectAllUrl = `https://api.businesshealthmetrics.com/reject-all`;

  const mailOptions = {
    from: '"BHM Writer"<milesoluku@gmail.com>',
    to: "milesoluku@gmail.com",
    subject: "Daily Article Approval - BHM",
    html: `
    <h1>${article?.title}</h1>
    <h2>Article:</h2>

    <section>${markdownToHtml(article?.content)}</section>

    <div>
    <a href='${approvalUrl}/${
      article?._id
    }' style='margin-right:10px;'>✅ Approve</a>
    <a href='${rejectUrl}' style='margin-right:10px;'>❌ Reject</a>
    <a href='${rejectAllUrl}'>🚫 Reject All</a>
    </div>

    <hr/>
    
    <h2>Article Review:</h2>
    
    <section>${markdownToHtml(pendingReviewedArticle?.content)}</section>

    <div>
    <a href='${approvalUrl}/${
      pendingReviewedArticle?._id
    }' style='margin-right:10px;'>✅ Approve</a>
    <a href='${rejectUrl}' style='margin-right:10px;'>❌ Reject</a>
    <a href='${rejectAllUrl}'>🚫 Reject All</a>
    </div>
           `,
  };
  await transporter.sendMail(mailOptions);
  console.log("SENT APPROVAL EMAIL");
}

async function articleReviewer(article: any) {
  let MD =
    'Markdown Guide Markdown Cheat Sheet A quick reference to the Markdown syntax. Overview This Markdown cheat sheet provides a quick overview of all the Markdown syntax elements. It can’t cover every edge case, so if you need more information about any of these elements, refer to the reference guides for basic syntax and extended syntax. Basic Syntax These are the elements outlined in John Gruber’s original design document. All Markdown applications support these elements. Element Markdown Syntax Heading # H1 ## H2 ### H3 Bold **bold text** Italic *italicized text* Blockquote > blockquote Ordered List 1. First item 2. Second item 3. Third item Unordered List - First item - Second item - Third item Code `code` Horizontal Rule --- Link [title](https://www.example.com) Image ![alt text](image.jpg) Extended Syntax These elements extend the basic syntax by adding additional features. Not all Markdown applications support these elements. Element Markdown Syntax Table | Syntax | Description | | ----------- | ----------- | | Header | Title | | Paragraph | Text | Fenced Code Block ``` { "firstName": "John", "lastName": "Smith", "age": 25 } ``` Footnote Here\'s a sentence with a footnote. [^1] [^1]: This is the footnote. Heading ID ### My Great Heading {#custom-id} Definition List term : definition Strikethrough ~~The world is flat.~~ Task List - [x] Write the press release - [ ] Update the website - [ ] Contact the media Emoji (see also Copying and Pasting Emoji) That is so funny! :joy: Highlight I need to highlight these ==very important words==. Subscript H~2~O Superscript X^2^';

  console.log({ promptRef2: promptRef, vectorSearchResults });
  try {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: "gemma3:12b-it-q4_K_M",
      prompt: `
      ROLE:
      You are an Expert Senior Writer Auditor for Business Health Metrics (BHM) - a Web Analytics Implementation and Consultancy Company. 

      Your job is too ensure the article provide is high quality and informative. 

      You should add Business Health Metrics "Call to Action" Links (CTA Links) in the "Improved Article" using MarkDown IF there is no CTA included within the Article being reviewed.

      IF Business Health Metric Embedded Markdown CTAs are not present in Article - add an embedded LINK CTA too the Improved Article using Markdown Syntax. 
      BHM services: Consultancy, Implementation, Implementation Retainer - URLS to Embed: https://www.businesshealthmetrics.com.
      
      Your Job is too ensure the Article is SEO Friendly.

      REQUIREMENTS:
      Based on this prompt: ${promptRef} how well does this article cover the topic? Create a Number Rating it between 0-1. 
      
      Create a improved verison of the article based on your suggestions. 
            
      The Improved Article should follow this syntax: ${MD}.

      The Improved Article should contain Markdown Embedded "Call to Action"  with Links for Business Health Metrics (BHM) services: 
      - For Consultancy use URL:  https://www.businesshealthmetrics.com/consultancy
      - For Implementation use URL: https://www.businesshealthmetrics.com/implementation
      - For Implementation Retainer use URL: https://www.businesshealthmetrics.com/retainer
      - For General Enquiries use URL: https://www.businesshealthmetrics.com/contact
      - FREE Web Anlaytics Tool Scanner use URL: https://www.businesshealthmetrics.com/free-website-audit
      - FREE Data Layer Scanner Anlaytics use URL: https://www.businesshealthmetrics.com/datalayer-scanner



      This is the article to review: ${article}. 




      Output should follow this format:

      Number Rating (0-1)

      Suggestions

      Improved Article (with CTA's added)

      Facts

      Fact References
      `,
      stream: false,
    });
    // console.log("OLLAMA RESPONSE", { response });
    return response.data.response.trim();
  } catch (error) {
    console.error("Error:", error);
    return "An error occurred while reviewing.";
  }
}

async function articleFactChecker(article: any) {
  let MD =
    'Markdown Guide Markdown Cheat Sheet A quick reference to the Markdown syntax. Overview This Markdown cheat sheet provides a quick overview of all the Markdown syntax elements. It can’t cover every edge case, so if you need more information about any of these elements, refer to the reference guides for basic syntax and extended syntax. Basic Syntax These are the elements outlined in John Gruber’s original design document. All Markdown applications support these elements. Element Markdown Syntax Heading # H1 ## H2 ### H3 Bold **bold text** Italic *italicized text* Blockquote > blockquote Ordered List 1. First item 2. Second item 3. Third item Unordered List - First item - Second item - Third item Code `code` Horizontal Rule --- Link [title](https://www.example.com) Image ![alt text](image.jpg) Extended Syntax These elements extend the basic syntax by adding additional features. Not all Markdown applications support these elements. Element Markdown Syntax Table | Syntax | Description | | ----------- | ----------- | | Header | Title | | Paragraph | Text | Fenced Code Block ``` { "firstName": "John", "lastName": "Smith", "age": 25 } ``` Footnote Here\'s a sentence with a footnote. [^1] [^1]: This is the footnote. Heading ID ### My Great Heading {#custom-id} Definition List term : definition Strikethrough ~~The world is flat.~~ Task List - [x] Write the press release - [ ] Update the website - [ ] Contact the media Emoji (see also Copying and Pasting Emoji) That is so funny! :joy: Highlight I need to highlight these ==very important words==. Subscript H~2~O Superscript X^2^';

  try {
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, {
      model: "deepseek-r1:8b",
      prompt: `Review this article throughly and fact check the information in the article using the provide context.


      Article to review: ${article}.
      Context: ${vectorSearchResults}
      
      Expected output format - ${MD}:

      Review: 

      Facts:

      References:
      `,
      stream: false,
    });
    // console.log("OLLAMA RESPONSE", { response });
    vectorSearchResults = undefined;
    return response.data.response.trim();
  } catch (error) {
    console.error("Error:", error);
    return "An error occurred while reviewing.";
  }
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
cron.schedule(
  "0 0 * * *",
  asyncMiddleware(async () => {
    console.log("[CRON] Running scheduled task at midnight", rejectedToday);
    if (rejectedToday) return; // Skip if rejected all for the day
    console.log(
      "[CRON] Running scheduled task at midnight 1",
      generateArticleWebMetrics
    );

    let content;
    try {
      content = await generateArticleWebMetrics();
      console.log(
        "[CRON] Running scheduled task at midnight 2",
        pendingArticle,
        content
      );
      pendingArticle = {
        _id: new ObjectId(),
        title: content.includes("**Title:**")
          ? content.split("**Title:**")[1].split("\n\n")[0]
          : content?.split("\n\n")[1],
        content: content.includes("**Title:**")
          ? content?.split("\n\n").slice(1).join("\n\n")
          : content?.split("\n\n").slice(1).join("\n\n"),
        creation: Date.now(),
      };

      let review = await articleReviewer(content);

      pendingReviewedArticle = {
        _id: new ObjectId(),
        title:
          review.includes("**Improved Article:**") &&
          review.includes("**Title:**")
            ? review
                .split("**Improved Article:**")[1]
                .split("**Title:**")[1]
                .split("\n\n")[0]
            : review.split("\n\n")[1],
        content: review.split("\n\n").slice(3).join("\n\n"),
        creation: Date.now(),
      };
      console.log(
        "[CRON] Running scheduled task at midnight 3",
        pendingArticle,
        content
      );

      await sendApprovalEmail(pendingArticle);
    } catch (error) {
      console.log({ error });
    }
    console.log(
      "[CRON] Running scheduled task at midnight 4 - EMAIL SENT",
      pendingArticle
    );
  })
);

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
    // console.log({ form });

    form.parse(req, async (err: any, fields: any, files: any) => {
      const file = files.file[0];
      const dataBuffer = fs.readFileSync(file.filepath);
      const parsed = await pdfParse(dataBuffer);

      const title = file.originalFilename;
      // const chunks = chunkText(parsed.text);
      const summary = await promptBasedSummary(parsed.text);
      // const keyFacts = await factFinder(parsed.text);

      // const embedding_facts = await embed(keyFacts); // DEL
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
        // facts: keyFacts.split("\n"),
        // embedding_facts,
        embedding_text,
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
    const { topic } = req.body;
    if (!topic) {
      // return res.status(400).json({ error: "Missing topic parameter" });
      const article = await generateArticleWebMetrics();
      pendingArticle = {
        _id: new ObjectId(),
        title: article.includes("**Title:**")
          ? article.split("**Title:**")[1].split("\n\n")[0]
          : article?.split("\n\n")[1],
        content: article.includes("**Title:**")
          ? article?.split("\n\n").slice(1).join("\n\n")
          : article?.split("\n\n").slice(1).join("\n\n"),
        creation: Date.now(),
      };

      let review = await articleReviewer(article);

      pendingReviewedArticle = {
        _id: new ObjectId(),
        title: review.includes("## Improved Article")
          ? review.split("## Improved Article")[1].split("\n\n")[0]
          : review.split("\n\n")[0],
        content: review,
        creation: Date.now(),
      };
      // factCheck = await articleFactChecker(review);
      //Delete?

      console.log({ review, article });
      await sendApprovalEmail(pendingArticle);
      // const article = await generateArticleWebMetrics();
      res
        .status(200)
        .send({ pendingArticle, facts: pendingArticle.facts, review });
    } else {
      const article = await generateArticleWebMetrics(topic);
      promptRef = topic;
      pendingArticle = {
        _id: new ObjectId(),
        title: article.includes("**Title:**")
          ? article.split("**Title:**")[1].split("\n\n")[0]
          : article?.split("\n\n")[1],
        content: article.includes("**Title:**")
          ? article?.split("\n\n").slice(1).join("\n\n")
          : article?.split("\n\n").slice(1).join("\n\n"),
        creation: Date.now(),
      };

      let review = await articleReviewer(article);

      pendingReviewedArticle = {
        _id: new ObjectId(),
        title: review.includes("## Improved Article")
          ? review.split("## Improved Article")[1].split("\n\n")[0]
          : review.split("\n\n")[0],
        content: review,
        creation: Date.now(),
      };
      // factCheck = await articleFactChecker(review);
      //Delete?

      console.log({ review, article });
      await sendApprovalEmail(pendingArticle);
      // const article = await generateArticleWebMetrics();
      res
        .status(200)
        .send({ pendingArticle, facts: pendingArticle.facts, review });
    }
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
app.get(
  "/approve/:id",
  asyncMiddleware(async (req: any, res: any) => {
    if (!pendingArticle || !pendingReviewedArticle)
      return res.send("No article pending.");
    console.log({
      params: req.params.id,
      id1: pendingArticle._id,
      id2: pendingReviewedArticle._id,
    });
    if (pendingArticle._id == req.params.id)
      await new Article({
        title: pendingArticle?.title,
        content: pendingReviewedArticle?.content,
      }).save();

    if (pendingReviewedArticle._id == req.params.id)
      await new Article({
        title: pendingReviewedArticle?.title,
        content: pendingReviewedArticle?.content,
      }).save();

    res.send("Article approved and saved:" + pendingArticle?.content);
    pendingArticle = null;
    pendingReviewedArticle = null;
    factCheck = null;
  })
);

app.get(
  "/reject",
  asyncMiddleware(async (req: any, res: any) => {
    if (!pendingArticle) return res.send("No article pending.");
    pendingArticle = null;
    pendingReviewedArticle = null;

    const article = await generateArticleWebMetrics();
    const review = await articleReviewer(article);
    pendingArticle = {
      _id: new ObjectId(),
      title: article.includes("**Title:**")
        ? article.split("**Title:**")[1].split("\n\n")[0]
        : article?.split("\n\n")[1],
      content: article.includes("**Title:**")
        ? article?.split("\n\n").slice(1).join("\n\n")
        : article?.split("\n\n").slice(1).join("\n\n"),
      creation: Date.now(),
    };

    pendingReviewedArticle = {
      _id: new ObjectId(),
      title: review.includes("## Improved Article")
        ? review.split("## Improved Article")[1].split("\n\n")[0]
        : review.split("\n\n")[0],
      content: review,
      creation: Date.now(),
    };

    await sendApprovalEmail(pendingArticle);
    res.send("Article rejected. New one sent.");
  })
);

app.get(
  "/reject-all",
  asyncMiddleware(async (req: any, res: any) => {
    rejectedToday = true;
    pendingArticle = null;
    res.send("No more articles will be sent today.");
  })
);

// BOTS ROUTES
app.post(
  "/audit",
  asyncMiddleware(async (req: any, res: any) => {
    try {
      let { siteUrl } = req.body;
      console.log({ siteUrl, body: req.body });
      if (!siteUrl) {
        return res.status(400).json({ error: "No site URL provided" });
      }

      if (!siteUrl.includes("http")) siteUrl = "https://" + siteUrl;

      const audit_metrics = await runAudit(siteUrl);
      const audit_social_proof = await auditReviews(siteUrl);

      console.log({ audit_metrics, audit_social_proof });

      res.status(200).json({ siteUrl, audit_metrics, audit_social_proof });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  })
);

app.post(
  "/crawl",
  asyncMiddleware(async (req: any, res: any) => {
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Method Not Allowed" });
    }

    let { url, dataLayer } = req.body;
    if (!url.includes("https://")) url = "https://" + url;

    console.log({ url, dataLayer });

    if (!url || !dataLayer) {
      return res
        .status(400)
        .json({ message: "URL and DataLayer name are required." });
    }

    // Run the Node.js script
    const process = spawn("node", ["crawlDataLayer.js", url, dataLayer]);

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
          const fileContents = fs.readFileSync("datalayer_report.json", "utf8");
          const json = JSON.parse(fileContents);
          // const result = JSON.parse(output);
          console.log({ json }); // => { message: "done" }
          return res.status(200).json(json);
        } catch (error) {
          return res.status(500).json({ message: "Error parsing result." });
        }
      } else {
        return res.status(500).json({ message: "Script execution failed." });
      }
    });
  })
);

// BLOG API
app.get(
  "/article/:_id",
  asyncMiddleware(async (req: any, res: any) => {
    let article = await Article.findOne({ _id: req.params._id }).exec();

    if (!article || article.length <= 0)
      return res.status(404).send("No Article found.");

    return res.status(200).json(article);
  })
);

app.get(
  "/articles",
  asyncMiddleware(async (req: any, res: any) => {
    let article = await Article.find({});

    if (!article || article.length <= 0)
      return res.status(404).send("No Article found.");

    return res.status(200).json(article);
  })
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
