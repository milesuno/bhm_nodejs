import mongoose from "mongoose";

const docPDFSchema = new mongoose.Schema({
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

module.exports = mongoose.model("WebPDFDoc", docPDFSchema);
