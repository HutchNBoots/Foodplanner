import { setMealImage } from "@/lib/db/queries";
import { fetchUnsplashPhoto } from "./unsplash";
import { placeholderImagePath } from "./placeholders";

/** Resolves and caches (see DECISIONS.md) the representative photo for one
 * meal. Runs once per meal at generation time; later views just read the
 * stored `imageUrl`/`imageSource` off the meal row. */
export async function resolveAndCacheMealImage(mealId: string, photoQuery: string, title: string) {
  const photo = await fetchUnsplashPhoto(photoQuery || title);

  if (photo) {
    await setMealImage(mealId, {
      url: photo.url,
      source: "unsplash",
      credit: {
        photographerName: photo.photographerName,
        photographerUrl: photo.photographerUrl,
        unsplashUrl: photo.unsplashUrl,
      },
    });
    return;
  }

  await setMealImage(mealId, {
    url: placeholderImagePath(photoQuery || title),
    source: "illustration",
  });
}
