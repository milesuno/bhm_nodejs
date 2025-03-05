const mongoose = require("mongoose");
const uri = process.env.DB_URI!;

export default function (handler: any) {
  return async (req: any, res: any, next: any) => {
    try {
      await mongoose.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });

      await handler(req, res, next);
    } catch (ex) {
      next(ex);
    }
  };
}
