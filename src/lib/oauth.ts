import * as arctic from "arctic";
import twilio from "twilio";

export const google = new arctic.Google(
  process.env.GOOGLE_CLIENT_ID!,
  process.env.GOOGLE_CLIENT_SECRET!,
  `${process.env.BACKEND_URL || 'http://localhost:3000'}/auth/google/callback`
);


export const twilio_client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

