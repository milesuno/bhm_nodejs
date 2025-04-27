"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const docPDFSchema = new mongoose_1.default.Schema({
    url: String,
    title: String,
    document: String,
    summary: String,
    facts: Array,
    page: Number,
    text: String,
    embedding_facts: { type: [Number], index: "2dsphere" },
    embedding_summary: { type: [Number], index: "2dsphere" },
    embedding_text: { type: [Number], index: "2dsphere" },
    createdAt: { type: Date, default: Date.now },
});
module.exports = mongoose_1.default.model("WebPDFDoc", docPDFSchema);
