import {z} from "zod";
import type { Request } from "express";

export const PhoneSchema = z.object({
    phone: z.string().min(10).max(15),
    userID:z.string().min(1)
})

// OTP Authentication Schemas
export const SendOtpSchema = z.object({
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format. Use E.164 format (e.g., +1234567890)"),
});

export const VerifyOtpSchema = z.object({
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, "Invalid phone number format"),
  code: z.string().length(6, "OTP code must be 6 digits"),
  role: z.enum(["PATIENT", "GUARDIAN", "DOCTOR"]).optional(), // Required only for new users
  fullName: z.string().min(1).optional(), // Required only for new users
});

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
  preferredHospitalIds: z.array(z.string().uuid()).min(1),
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

// Booking schemas
export const CreateBookingSchema = z.object({
  hospitalId: z.string().uuid(),
  pickupType: z.enum(["HOSPITAL", "HOME"]),
  pickupLat: z.number().min(-90).max(90).optional(),
  pickupLng: z.number().min(-180).max(180).optional(),
  pickupAddress: z.string().optional(),
  scheduledAt: z.string().datetime(), // ISO datetime string
  notes: z.string().max(500).optional(),
  serviceIds: z.array(z.string().uuid()).optional(),
}).refine(
  (data) => {
    // If pickup type is HOME, lat and lng are required
    if (data.pickupType === "HOME") {
      return data.pickupLat !== undefined && data.pickupLng !== undefined;
    }
    return true;
  },
  {
    message: "Latitude and longitude are required for HOME pickup",
    path: ["pickupLat", "pickupLng"],
  }
);

export const GuardianResponseSchema = z.object({
  bookingId: z.string().uuid(),
  action: z.enum(["ACCEPT", "REJECT"]),
});

export const UpdateBookingStatusSchema = z.object({
  status: z.enum(["IN_PROGRESS", "COMPLETED", "CANCELLED"]),
});