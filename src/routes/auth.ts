import { Router } from "express";
import { generateState, generateCodeVerifier } from "arctic";
import { google } from "../OAuth";
import { prisma } from "../db";
import type { Request, Response } from "express";

const router = Router()

const sessions = new Map<string, string>(); // store verifier temporarily

// 🌐 Step 1: Redirect user to Google
router.get("/google", (req: Request, res: Response) => {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();

  sessions.set(state, codeVerifier);

  const url = google.createAuthorizationURL(state, codeVerifier, [
    "openid",
    "profile",
    "email",
  ]);

  return res.redirect(url.toString());
});


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



// 🔁 Step 2: Handle Google callback
router.get("/google/callback", async (req, res) => {
  try {
    const { state, code } = req.query as Record<string, string>;

    if (!state || !code) {
      return res.status(400).send("Missing state or code");
    }

    const verifier = sessions.get(state);
    if (!verifier) return res.status(400).send("Invalid state");

    const tokens = await google.validateAuthorizationCode(code, verifier);

    const userInfo = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokens.accessToken()}`,
        },
      }
    ).then((r) => r.json());

    const { email, name } = userInfo as GoogleUserInfo;

    // 🌱 Auto register if user does not exist
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name,
          phone: "not-provided", 
        },
      });
    }

    return res.json({
      message: "OAuth success",
      user,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send("OAuth failed");
  }
});

export default router;



