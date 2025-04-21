import mongoose from "mongoose";

const docSchema = new mongoose.Schema({
  url: String,
  title: String,
  document: String,
  facts: Array,
  embedding: { type: [Number], index: "2dsphere" },
  createdAt: { type: Date, default: Date.now },
});

module.exports  = mongoose.model("WebDoc", docSchema);
