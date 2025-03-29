"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const audit_1 = require("../controllers/audit");
const router = express_1.default.Router();
router.post("/audit", async (req, res) => {
    try {
        const { siteUrl } = req.body;
        if (!siteUrl) {
            return res.status(400).json({ error: "No site URL provided" });
        }
        const result = await (0, audit_1.runAudit)(siteUrl);
        res.status(200).json(result);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
