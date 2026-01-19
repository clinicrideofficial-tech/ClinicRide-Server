import {z} from "zod";
import type { Request } from "express";

export const PhoneSchema = z.object({
    phone: z.string().min(10).max(15),
    userID:z.string().min(1)
})

export interface userID_REQUEST extends Request {
    user_Id?: string;
}

export interface GoogleUserInfo {
  sub: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  email: string;
  email_verified: boolean;
  locale: string;
}