import type { NextFunction, Request, Response } from "express";
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET!;

// interface userID_REQUEST extends Request {
//     user_Id?: string;
// }

interface payload {
    id: string;
}

const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.accessToken || req.headers.authorization?.split(" ")[1];
    if (!token){
        return res.status(401).json({ error: "Unauthorized" });
     } 

    // jwt.verify will throw if expired or invalid 
    try {
        const payload = jwt.verify(token, JWT_SECRET) as payload;
        req.body.user_Id = payload.id ; 
        next(); 
    } catch (err:any) {
        if (err.name === "TokenExpiredError") { 
            return res.status(401).json({ error: "Token expired" });
        } 
        return res.status(401).json({ error: "Invalid token" });
    }
}

export default authMiddleware
