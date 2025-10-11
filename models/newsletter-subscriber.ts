import mongoose from "mongoose";
const NewsletterSubcriberSchema = new mongoose.Schema({
  email: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model(
  "NewsletterSubscriber",
  NewsletterSubcriberSchema
);
