import error from "./middleware/error";
import audit from "./routes/audit";
import auditRoute from "./routes/auditRoute";

import payments from "./routes/payments";

export default function (app: any) {
  // TODO: NO ROUTES CURRENT SAVE DATA TO MONGODB
  app.use("/audit", audit);
  app.use("/auditRoute", auditRoute);

  // TODO /enquires? name, email
  // Follow up emails with link to book in consultancy on Calendar Schedule App
  app.use("/payments", payments); // SCAN PRO? Analytics Newsletter (Used also on Substack)?
  // app.use("/webhooks", handler);

  app.use(error);
}
