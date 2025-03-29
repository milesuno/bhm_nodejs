"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const error_1 = __importDefault(require("./middleware/error"));
const audit_1 = __importDefault(require("./routes/audit"));
const auditRoute_1 = __importDefault(require("./routes/auditRoute"));
const payments_1 = __importDefault(require("./routes/payments"));
function default_1(app) {
    // TODO: NO ROUTES CURRENT SAVE DATA TO MONGODB
    app.use("/audit", audit_1.default);
    app.use("/auditRoute", auditRoute_1.default);
    // TODO /enquires? name, email
    // Follow up emails with link to book in consultancy on Calendar Schedule App
    app.use("/payments", payments_1.default); // SCAN PRO? Analytics Newsletter (Used also on Substack)?
    // app.use("/webhooks", handler);
    app.use(error_1.default);
}
