import { getOrCreateHousehold } from "@/lib/db/queries";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage() {
  const household = await getOrCreateHousehold();

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl font-semibold">Settings</h1>
      <SettingsForm household={household} />
    </div>
  );
}
