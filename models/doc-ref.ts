import mongoose from "mongoose";

const docSchema = new mongoose.Schema({
  url: String,
  title: String,
  document: String,
  facts: Array,
  embedding_facts: { type: [Number], index: "2dsphere" },
  embedding_doc: { type: [Number], index: "2dsphere" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("WebDoc", docSchema);
