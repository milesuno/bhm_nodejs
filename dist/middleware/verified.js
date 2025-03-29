"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
require("dotenv").config();
function default_1(req, res, next) {
    const token = req.header("x-auth-token");
    let jwt_key = process.env.DB_JWT_PRIVATE_KEY;
    if (!token)
        return res.status(401).send("Access Denied. No Token Provided");
    try {
        const decoded = jsonwebtoken_1.default.verify(token, jwt_key);
        req.user = decoded;
        if (!req.user.isVerified)
            return res.status(403).send("This account is not verified.");
        next();
    }
    catch (error) {
        return res.status(400).send("Invalid Token.");
    }
}
