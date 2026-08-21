import { getFreezerInventory, getOrCreateHousehold } from "@/lib/db/queries";
import { PROTEIN_TYPES } from "@/lib/intake";
import { SettingsForm } from "@/components/SettingsForm";
import { FreezerInventory } from "@/components/FreezerInventory";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const household = await getOrCreateHousehold();
  const freezerItems = await getFreezerInventory(household.id);

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="section-title mb-4 text-2xl">Settings</h1>
      <SettingsForm household={household} proteinTypes={[...PROTEIN_TYPES]} />
      <FreezerInventory items={freezerItems} />
    </div>
  );
}
