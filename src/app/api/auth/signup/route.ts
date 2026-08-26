import { NextResponse } from "next/server";
import { z } from "zod";
import { constantTimeEquals, createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { createHouseholdAccount, generateUniqueUsername } from "@/lib/db/queries";

// Reuses APP_PASSWORD as the sign-up invite code (per the operator's
// decision - see DECISIONS.md's "Sign-up journey" entry) rather than a
// separate env var: each generated week costs real Claude API money, so
// sign-up stays gated to people the operator actually gave the code to,
// same shared secret that used to gate the whole app.
const signupSchema = z.object({
  inviteCode: z.string().min(1, "Enter the invite code."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(request: Request) {
  const appPassword = process.env.APP_PASSWORD;
  if (!appPassword) {
    return NextResponse.json(
      { error: "Server is missing the APP_PASSWORD environment variable." },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid signup details." }, { status: 400 });
  }

  if (!constantTimeEquals(parsed.data.inviteCode, appPassword)) {
    return NextResponse.json({ error: "Invalid invite code." }, { status: 403 });
  }

  const username = await generateUniqueUsername();
  const passwordHash = await hashPassword(parsed.data.password);
  const household = await createHouseholdAccount({ username, passwordHash });

  const token = await createSessionToken(household.id);
  const response = NextResponse.json({ username: household.username });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
