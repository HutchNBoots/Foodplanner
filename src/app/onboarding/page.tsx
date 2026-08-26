import { getCurrentHousehold } from "@/lib/db/queries";
import { OnboardingForm } from "@/components/OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const household = await getCurrentHousehold();

  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-4 text-center">
        <h1 className="section-title text-2xl">Set up your household</h1>
        <p className="mt-1 text-sm text-ink-500">
          A few quick questions - everything here is editable later in Settings.
        </p>
      </div>
      <OnboardingForm household={household} />
    </div>
  );
}
