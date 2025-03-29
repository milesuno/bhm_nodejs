"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const ArticleSchema = new mongoose_1.default.Schema({
    title: String,
    content: String,
    createdAt: { type: Date, default: Date.now },
});
module.exports = mongoose_1.default.model("Article", ArticleSchema);
