"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Polls week status while Claude generates the plan in the background (see
 * the `after()` call in /api/generate) and refreshes the server component
 * once it's ready or errored (PROJECT.md §4 step 2: "show a loading state"). */
export function GeneratingStatus({ weekId }: { weekId: string }) {
  const router = useRouter();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      const res = await fetch(`/api/weeks/${weekId}/status`);
      if (!res.ok) return;
      const data = (await res.json()) as { status: string };
      if (data.status !== "generating") {
        if (intervalRef.current) clearInterval(intervalRef.current);
        router.refresh();
      }
    }, 3000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [weekId, router]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      <div>
        <p className="font-medium text-neutral-700">Generating your week...</p>
        <p className="mt-1 text-sm text-neutral-500">
          Claude is planning meals, macros and the shopping list. This can take a minute.
        </p>
      </div>
    </div>
  );
}
