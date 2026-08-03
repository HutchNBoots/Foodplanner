import { expect, test } from "@playwright/test";

const PASSWORD = "e2e-test-password";

test("full flow: login -> intake -> generate (mocked) -> recipes -> shopping list -> feedback", async ({
  page,
}) => {
  // Unauthenticated requests get redirected to /login by the auth gate.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "Plan a new week" })).toBeVisible();

  await page.getByRole("link", { name: "Plan a new week" }).click();
  await expect(page).toHaveURL("/plan/new");

  await page.getByRole("button", { name: "Generate my week" }).click();

  // Redirects to /plan/[weekId]. Generation is mocked and often finishes
  // before the client even requests this page, so the "Generating..." state
  // (rendered by GeneratingStatus while status="generating") may or may not
  // be caught - what matters is it always lands on the ready state, via
  // either an immediate render or the status-polling refresh.
  await expect(page).toHaveURL(/\/plan\/[^/]+$/);

  // Days are collapsed by default (MVP 1.3 follow-up, see DECISIONS.md) - the
  // day summary is visible while collapsed, but the meal card underneath
  // isn't until it's opened. `.click()` auto-waits, which also covers the
  // generating -> ready transition described above. Scoped to
  // `[data-testid="day-section"]` since `WeekNutritionSummary` above it on
  // the page is also a collapsed `<details>`.
  await page.getByTestId("day-section").first().locator("summary").first().click({ timeout: 20_000 });
  await expect(page.getByText("Batch-cooked chicken tray bake")).toBeVisible();

  // Recipe view: ingredients/method are visible and macros are rendered.
  await expect(page.getByText("kcal").first()).toBeVisible();
  await page.getByText("Ingredients (2)").first().click();
  await expect(page.getByText("chicken breast").first()).toBeVisible();

  // Leave feedback on the first meal - should persist and show a confirmation.
  await page.getByRole("button", { name: "Loved it" }).first().click();
  await expect(page.getByText("Saved - this'll steer next week's plan.").first()).toBeVisible();

  // Shopping list view: aisle-grouped, with the aggregated ingredient visible.
  await page.getByRole("link", { name: "Shopping list" }).click();
  await expect(page).toHaveURL(/\/plan\/[^/]+\/shopping$/);
  await expect(page.getByRole("heading", { name: "Meat & fish" })).toBeVisible();
  await expect(page.getByText("chicken breast")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy as plain text" })).toBeVisible();

  // Checklist behaviour: ticking an item persists (survives a reload), per
  // MVP 1.1's "must-ship" shopping-list checklist requirement.
  const chickenCheckbox = page.getByRole("checkbox").first();
  await chickenCheckbox.check();
  await expect(chickenCheckbox).toBeChecked();
  await page.reload();
  await expect(page.getByRole("checkbox").first()).toBeChecked();
});
