import express from "express";
import asyncMiddleware from "./../middleware/asyncMiddleware";
const router = express.Router();

router.get("/approve", async (req: any, res: any) => {
  if (!pendingArticle) return res.send("No article pending.");
  await new Article({
    title: pendingArticle.title,
    content: pendingArticle.content,
  }).save();
  pendingArticle = null;
  res.send("Article approved and saved.");
});

export default router;
