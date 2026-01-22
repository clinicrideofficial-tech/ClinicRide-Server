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

// Profile Schemas
export const PatientProfileSchema = z.object({
  age: z.number().int().min(1).max(150),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  emergencyPhone: z.string().min(10).max(15).optional(),
});

export const GuardianProfileSchema = z.object({
  age: z.number().int().min(18).max(80),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  locality: z.string().min(1),
  preferredAreas: z.array(z.string()).min(1),
});

export const DoctorProfileSchema = z.object({
  qualification: z.string().min(1),
  experience: z.number().int().min(0),
  hospitalName: z.string().min(1),
  city: z.string().min(1),
  hospitalId: z.string().uuid(),
});

// User update schema
export const UserUpdateSchema = z.object({
  fullName: z.string().min(1).optional(),
  mobile: z.string().min(10).max(15).optional(),
});