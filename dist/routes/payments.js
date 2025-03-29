"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const asyncMiddleware_1 = __importDefault(require("./../middleware/asyncMiddleware"));
const router = express_1.default.Router();
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
router.post("/checkout", (0, asyncMiddleware_1.default)(async (req, res) => {
    //   try {
    //     const session = await stripe.checkout.sessions.create({
    //       payment_method_types: ["card"],
    //       line_items: [
    //         {
    //           price_data: {
    //             currency: "gbp",
    //             product_data: { name: "Pro Website Audit" },
    //             unit_amount: 1000, // £10.00
    //           },
    //           quantity: 1,
    //         },
    //       ],
    //       mode: "subscription",
    //       success_url: "http://localhost:3000/success",
    //       cancel_url: "http://localhost:3000/cancel",
    //     });
    //     res.json({ url: session.url });
    //   } catch (error) {
    //     console.error(error);
    //     res.status(500).send("Payment failed");
    //   }
}));
exports.default = router;
