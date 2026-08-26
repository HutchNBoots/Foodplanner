"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { APP_VERSION } from "@/lib/version";

export default function SignupPage() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode, password }),
    });
    setLoading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong.");
      return;
    }

    router.replace("/onboarding");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="text-center">
          <div className="text-3xl">🥗</div>
          <h1 className="section-title mt-2 text-xl">Create your household</h1>
          <p className="mt-1 text-sm text-ink-500">
            We&apos;ll generate a username for you - no email needed. A few quick questions about your
            household come next.
          </p>
        </div>
        <div>
          <label htmlFor="inviteCode" className="label">
            Invite code
          </label>
          <input
            id="inviteCode"
            className="input"
            autoFocus
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            Choose a password
          </label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="new-password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <p className="mt-1 text-xs text-ink-500">At least 8 characters.</p>
        </div>
        <div>
          <label htmlFor="confirmPassword" className="label">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            type="password"
            className="input"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Creating..." : "Create household"}
        </button>
        <p className="text-center text-sm text-ink-500">
          Already have an account? <Link href="/login" className="font-medium text-ink-800 underline">Log in</Link>
        </p>
        <p className="data-figure text-center text-xs text-ink-300">v{APP_VERSION}</p>
      </form>
    </div>
  );
}
