require("dotenv").config();
import jwt from "jsonwebtoken";

export default function (req: any, res: any, next: any) {
  const token = req.header("x-auth-token");
  let jwt_key = process.env.DB_JWT_PRIVATE_KEY!;
  
  if (!token) return res.status(401).send("Access Denied. No Token Provided");

  try {
    const decoded = jwt.verify(token, jwt_key);
    req.user = decoded;
    
    next();
  } catch (error) {
    return res.status(400).send("Invalid Token.");
  }
}
