import type { NextFunction, Request, Response } from "express";
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET!;

// Extend Express Request to include userId
declare global {
    namespace Express {
        interface Request {
            userId?: string;
            token?: string;
        }
    }
}

interface JwtPayload {
    id: string;
}

const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies.token || req.headers.authorization?.split(" ")[1];
    if (!token) {
        return res.status(401).json({ error: "Unauthorized" });
    } 
    try {
        const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
        req.userId = payload.id; 
        req.token = token;
        next(); 

    } catch (err: any) {
        if (err.name === "TokenExpiredError") { 
            return res.status(401).json({ error: "Token expired" });
        } 
        return res.status(401).json({ error: "Invalid token" });
    }
}

export default authMiddleware
