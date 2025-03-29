"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const winston_1 = __importDefault(require("winston"));
function default_1(err, req, res, next) {
    winston_1.default.error(err.message, err);
    console.log("BIG ERROR:", { err });
    return res.status(500).send({ err });
}
