import mongoose from "mongoose";

const docSchema = new mongoose.Schema({
  url: String,
  title: String,
  text: String,
  summary: String,
  facts: Array,
  embedding_facts: { type: [Number], index: "2dsphere" },
  embedding_summary: { type: [Number], index: "2dsphere" },
  embedding_text: { type: [Number], index: "2dsphere" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("WebDoc", docSchema);
