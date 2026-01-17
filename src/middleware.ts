import type { NextFunction, Request, Response } from "express";
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

interface CustomRequest extends Request {
    userId?: string;
}

const JWT_SECRET = process.env.JWT_SECRET!;

const authMiddleware = (req: CustomRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if(!authHeader || !authHeader.startsWith('Bearer')){
        return res.status(403).json({
            message:"invalid headers"
        })
    }

    const token = authHeader.split(' ')[1]!;

    try{
        const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
        req.userId = decoded.userId as string;
        next();

    } catch(e) {
        res.status(403).json({})
    }
}

export default authMiddleware
