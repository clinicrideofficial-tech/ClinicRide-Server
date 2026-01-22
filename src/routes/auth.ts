import { Router } from "express";
import { generateState, generateCodeVerifier } from "arctic";
import { google } from "../lib/oauth"
import { prisma } from "../lib/db";
import type { Request, Response } from "express";
import { sign } from "jsonwebtoken";
import type { GoogleUserInfo } from "../types";

const JWT_SECRET = process.env.JWT_SECRET || "secret";

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

    // If user already exists, return them
    if (existingAuthAccount) {
      const token = sign({ id: existingAuthAccount.userId }, JWT_SECRET, { expiresIn: "7d" });

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return res.json({
        message: "Login successful",
        user: existingAuthAccount.userId,
        isNewUser: false,
      });
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

    const token = sign({ id: newUser.id }, JWT_SECRET, { expiresIn: "7d" });

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({
      message: "Registration successful",
      user: newUser,
      isNewUser: true,
      nextStep: "Please complete your profile",
    });
  } catch (err) {
    console.error("OAuth error:", err);
    return res.status(500).json({ error: "OAuth failed" });
  }
});

router.get("/refresh", async (req, res) => {
    
})

export default router;



