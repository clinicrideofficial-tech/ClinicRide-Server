import { Router } from "express";
import dotenv from 'dotenv';
dotenv.config();
import { generateState, generateCodeVerifier } from "arctic";
import { google } from "../lib/oauth"
import { prisma } from "../lib/db";
import type { Request, Response } from "express";
import { sign } from "jsonwebtoken";
import { SendOtpSchema, VerifyOtpSchema } from "../types";
import type { GoogleUserInfo } from "../types";
import { twilio_client } from "../lib/oauth"

const JWT_SECRET = process.env.JWT_SECRET!;
const VERIFY_SERVICE_SID = process.env.VERIFY_SERVICE_SID;

const router = Router()

// Store verifier and role temporarily (keyed by state)
const sessions = new Map<string, { verifier: string; role?: string }>();

//Redirect user to Google
router.get("/google", (req: Request, res: Response) => {
  const { role } = req.query as { role?: string };
  
  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  // Store both verifier and role in session
  sessions.set(state, { 
    verifier: codeVerifier, 
    role: role?.toUpperCase() 
  });

  const url = google.createAuthorizationURL(state, codeVerifier, [
    "openid",
    "profile",
    "email",
  ]);

  return res.redirect(url.toString());
});

//Handle Google callback
router.get("/google/callback", async (req, res) => {
  try {
    const { state, code } = req.query as Record<string, string>;

    if (!state || !code) {
      return res.status(400).json({ error: "Missing state or code" });
    }

    const session = sessions.get(state);
    if (!session) {
      return res.status(400).json({ error: "Invalid state" });
    }

    const { verifier, role } = session;

    // Clean up the session
    sessions.delete(state);

    const tokens = await google.validateAuthorizationCode(code, verifier);

    const userInfo = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken()}`,
        },
      }
    ).then((r) => r.json());

    const { sub: googleUserId, email, name } = userInfo as GoogleUserInfo & { sub: string };

    // Check if AuthAccount exists for this Google user
    const existingAuthAccount = await prisma.authAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: "GOOGLE",
          providerUserId: googleUserId,
        },
      },
      include: {
        user: true,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    // If user already exists, log them in
    if (existingAuthAccount) {
      const token = sign({ id: existingAuthAccount.userId, role: (existingAuthAccount as any).user.role }, JWT_SECRET, { expiresIn: "7d" });

      res.cookie("token", token, {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Redirect to frontend callback handler
      return res.redirect(`${frontendUrl}/auth/google/callback`);
    }

    // New user - role is required (was passed when initiating /google?role=...)
    if (!role || !["PATIENT", "GUARDIAN", "DOCTOR"].includes(role)) {
      return res.status(400).json({
        error: "Role is required for new users. Start OAuth with /auth/google?role=PATIENT|GUARDIAN|DOCTOR",
        validRoles: ["PATIENT", "GUARDIAN", "DOCTOR"],
      });
    }

    const userRole = role as "PATIENT" | "GUARDIAN" | "DOCTOR";

    // Create new user with AuthAccount in a transaction
    const newUser = await prisma.$transaction(async (tx) => {
      // Create the user
      const user = await tx.user.create({
        data: {
          fullName: name || "Unknown",
          email: email,
          role: userRole,
          authAccounts: {
            create: {
              provider: "GOOGLE",
              providerUserId: googleUserId,
            },
          },
        },
      });

      return user;
    });

    const token = sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: "7d" });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    // Redirect to frontend callback handler
    return res.redirect(`${frontendUrl}/auth/google/callback`);
  } catch (err) {
    console.error("OAuth error:", err);
    return res.status(500).json({ error: "OAuth failed" });
  }
});

// Send OTP to phone number
router.post('/send-otp', async (req, res) => {
  try {
    // Validate request body
    const validatedData = SendOtpSchema.parse(req.body);
    const { phoneNumber } = validatedData;

    if (!VERIFY_SERVICE_SID) {
      return res.status(500).json({ error: "Twilio Verify Service is not configured" });
    }

    // Send OTP via Twilio
    const verification = await twilio_client.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verifications.create({ to: phoneNumber, channel: 'sms' });
    
    return res.status(200).json({ 
      message: 'OTP sent successfully', 
      status: verification.status,
      to: phoneNumber 
    });
  } catch (error: any) {
    console.error("Send OTP error:", error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: error.errors 
      });
    }
    
    return res.status(500).json({ 
      error: error.message || "Failed to send OTP" 
    });
  }
});

// Verify OTP and authenticate user
router.post('/verify-otp', async (req, res) => {
  try {
    // Validate request body
    const validatedData = VerifyOtpSchema.parse(req.body);
    const { phoneNumber, code, role, fullName } = validatedData;

    if (!VERIFY_SERVICE_SID) {
      return res.status(500).json({ error: "Twilio Verify Service is not configured" });
    }

    // Verify OTP with Twilio
    const verificationCheck = await twilio_client.verify.v2
      .services(VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phoneNumber, code: code });

    if (verificationCheck.status !== 'approved') {
      return res.status(400).json({ 
        message: 'Invalid or expired OTP',
        status: verificationCheck.status 
      });
    }

    // OTP is valid, check if user exists
    const existingAuthAccount = await prisma.authAccount.findUnique({
      where: {
        provider_providerUserId: {
          provider: "MOBILE",
          providerUserId: phoneNumber,
        },
      },
      include: {
        user: true,
      },
    });

    // If user already exists, log them in
    if (existingAuthAccount) {
      const token = sign(
        { id: existingAuthAccount.userId, role: (existingAuthAccount as any).user.role }, 
        JWT_SECRET, 
        { expiresIn: '7d' }
      );

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return res.status(200).json({ 
        message: 'Login successful', 
        userId: existingAuthAccount.userId,
        isNewUser: false,
        token: token 
      });
    }

    // New user - role and fullName are required
    if (!role || !fullName) {
      return res.status(400).json({
        error: "Role and fullName are required for new users",
        validRoles: ["PATIENT", "GUARDIAN", "DOCTOR"],
        isNewUser: true,
        phoneNumber: phoneNumber
      });
    }

    // Create new user with mobile auth account
    const newUser = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName: fullName,
          mobile: phoneNumber,
          role: role,
          authAccounts: {
            create: {
              provider: "MOBILE",
              providerUserId: phoneNumber,
            },
          },
        },
      });

      return user;
    });

    const token = sign(
      { id: newUser.id, role: newUser.role }, 
      JWT_SECRET, 
      { expiresIn: '7d' }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({ 
      message: 'Registration successful', 
      user: newUser,
      isNewUser: true,
      nextStep: "Please complete your profile",
      token: token 
    });
  } catch (error: any) {
    console.error("Verify OTP error:", error);
    
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: "Validation failed", 
        details: error.errors 
      });
    }
    
    return res.status(500).json({ 
      error: error.message || "Failed to verify OTP" 
    });
  }
});


router.get("/refresh", async (req, res) => {
    
})

export default router;



