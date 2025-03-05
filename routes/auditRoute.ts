import express from "express";
import { runAudit } from "../controllers/audit";

const router = express.Router();

router.post("/audit", async (req: any, res: any) => {
  try {
    const { siteUrl } = req.body;
    if (!siteUrl) {
      return res.status(400).json({ error: "No site URL provided" });
    }

    const result = await runAudit(siteUrl);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
