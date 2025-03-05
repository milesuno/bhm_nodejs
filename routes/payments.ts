import express from "express";
import asyncMiddleware from "./../middleware/asyncMiddleware";
const router = express.Router();
// const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

router.post(
  "/checkout",
  asyncMiddleware(async (req: any, res: any) => {
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
  })
);

export default router;
