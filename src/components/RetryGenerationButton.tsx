"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Retries a failed week's generation in place (MVP 1.1 bug fix - see
 * DECISIONS.md's "Retry design") instead of sending the user back through
 * the whole intake form. */
export function RetryGenerationButton({ weekId }: { weekId: string }) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRetry() {
    setRetrying(true);
    setError(null);
    const res = await fetch(`/api/weeks/${weekId}/retry`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't start a retry.");
      setRetrying(false);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <button type="button" className="btn-primary" onClick={onRetry} disabled={retrying}>
        {retrying ? "Retrying..." : "Retry with the same answers"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
