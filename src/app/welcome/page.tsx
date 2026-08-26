import Link from "next/link";
import { getCurrentHousehold } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const household = await getCurrentHousehold();

  return (
    <div className="mx-auto max-w-sm">
      <div className="card space-y-5 p-6 text-center">
        <div className="text-3xl">🎉</div>
        <div>
          <h1 className="section-title text-2xl">You&apos;re all set, {household.name}</h1>
          <p className="mt-2 text-sm text-ink-500">
            Your username is how you&apos;ll log back in - write it down, there&apos;s no email to
            recover it with.
          </p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
          <p className="text-xs font-medium tracking-wide text-ink-500 uppercase">Your username</p>
          <p className="data-figure mt-1 text-2xl font-semibold text-ink-800">{household.username}</p>
          <p className="mt-1 text-xs text-ink-500">
            You can find this again anytime under Settings if you forget.
          </p>
        </div>
        <ul className="space-y-1.5 text-left text-sm text-ink-600">
          <li>
            <span className="font-medium text-ink-800">This Week</span> - plan a new week, Claude
            generates the whole thing.
          </li>
          <li>
            <span className="font-medium text-ink-800">History</span> - every past week, still
            editable and deletable.
          </li>
          <li>
            <span className="font-medium text-ink-800">Settings</span> - your household defaults,
            favourite proteins, and freezer stash.
          </li>
        </ul>
        <Link href="/" className="btn-primary block w-full">
          Let&apos;s go
        </Link>
      </div>
    </div>
  );
}
