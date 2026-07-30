const UNSPLASH_API = "https://api.unsplash.com";

export type UnsplashPhoto = {
  url: string;
  photographerName: string;
  photographerUrl: string;
  unsplashUrl: string;
};

/** Searches Unsplash for a representative photo (PROJECT.md §5). Returns null
 * if no key is configured, the request fails, or nothing matches - callers
 * fall back to a local illustration in that case (see DECISIONS.md). */
export async function fetchUnsplashPhoto(query: string): Promise<UnsplashPhoto | null> {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) return null;

  try {
    const res = await fetch(
      `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape&content_filter=high`,
      {
        headers: { Authorization: `Client-ID ${accessKey}` },
        // Photos are cached by mealId in our own DB (see setMealImage), so we
        // never need Next's fetch cache to also hold onto this.
        cache: "no-store",
      },
    );

    if (!res.ok) return null;

    const data = (await res.json()) as {
      results: Array<{
        urls: { regular: string };
        links: { download_location: string };
        user: { name: string; links: { html: string } };
        links_html?: string;
      }>;
    };

    const photo = data.results[0];
    if (!photo) return null;

    // Required by Unsplash API guidelines: ping download_location whenever a
    // photo is actually used/displayed. Best-effort, doesn't block the caller.
    fetch(photo.links.download_location, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    }).catch(() => {});

    return {
      url: photo.urls.regular,
      photographerName: photo.user.name,
      photographerUrl: `${photo.user.links.html}?utm_source=foodplanner&utm_medium=referral`,
      unsplashUrl: "https://unsplash.com/?utm_source=foodplanner&utm_medium=referral",
    };
  } catch {
    return null;
  }
}
