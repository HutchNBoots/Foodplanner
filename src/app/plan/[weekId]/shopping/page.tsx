import { notFound } from "next/navigation";
import { getWeekDetail } from "@/lib/db/queries";
import { WeekTabs } from "@/components/WeekTabs";
import { ShoppingList } from "@/components/ShoppingList";

export default async function ShoppingListPage({ params }: { params: Promise<{ weekId: string }> }) {
  const { weekId } = await params;
  const detail = await getWeekDetail(weekId);
  if (!detail) notFound();

  const { week, shoppingItems } = detail;

  if (week.status !== "ready") {
    return (
      <div>
        <WeekTabs weekId={weekId} active="shopping" />
        <p className="text-sm text-neutral-500">The shopping list will appear once the plan is ready.</p>
      </div>
    );
  }

  return (
    <div>
      <WeekTabs weekId={weekId} active="shopping" />
      <h1 className="mb-4 text-xl font-semibold">Shopping list</h1>
      <ShoppingList items={shoppingItems} />
    </div>
  );
}
