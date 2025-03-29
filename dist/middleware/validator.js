"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
async function default_1(obj, schemaType, schemaName, res) {
    try {
        await schemaType.validateAsync(obj);
    }
    catch (error) {
        console.log({
            vERR: error,
            Deets: error.details,
            Deets2: { path: error.details.path, context: error.details.context },
            schemaName,
        });
        return res.status(400).send(`${schemaName}: Bad request.`);
    }
}
