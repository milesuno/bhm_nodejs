"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const mongoose = require("mongoose");
const uri = process.env.DB_URI;
function default_1(handler) {
    return async (req, res, next) => {
        console.log({ uri });
        try {
            await mongoose.connect(uri, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
            });
            await handler(req, res, next);
        }
        catch (ex) {
            next(ex);
        }
    };
}
