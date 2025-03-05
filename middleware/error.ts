import winston from "winston";

export default function (err: any, req: any, res: any, next: any) {
  winston.error(err.message, err);
  console.log("BIG ERROR:", { err });
  return res.status(500).send({ err });
}
