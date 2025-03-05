const mongoose = require("mongoose");

const AuditSchema = new mongoose.Schema({
  url: { type: String, required: true },

  // Tracking Tools
  
  // CONSENT 
  oneTrust: String,
  
  //TMS
  googleTagManager: String,
  tealium: String,

  //ANALYTICS
  googleAnalytics: String,
  googleAnalytics4: String,
  adobeAnalytics: String,

  // UX ANALYTICS
  contentSquare: String,
  crazyEgg: String,
  hotjar: String,

  // MARKETING
  tiktokPixel: String,

  //PERSONALIATION
  adobeTarget: String,
  floodlight: String,

  // Consent Banner
  consentBanner: String,

  // SEO Checks
  seoTitle: String,
  seoDescription: String,
  seoDescriptionLength: String,
  seoH1: String,
  seoCanonical: String,
  seoViewport: String,
  seoImageAlt: String,

  // Timestamp
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Audit", AuditSchema);
