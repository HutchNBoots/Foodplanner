import Image from "next/image";
import type { ImageCredit } from "@/lib/db/schema";

export function RecipePhoto({
  src,
  alt,
  source,
  credit,
}: {
  src: string | null;
  alt: string;
  source: "unsplash" | "illustration" | null;
  credit: ImageCredit | null;
}) {
  if (!src) {
    return <div className="aspect-video w-full rounded-xl bg-neutral-100" />;
  }

  const isRemote = source === "unsplash";

  return (
    <div className="relative">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-neutral-100">
        {isRemote ? (
          <Image src={src} alt={alt} fill sizes="(max-width: 640px) 100vw, 640px" className="object-cover" />
        ) : (
          // Local SVG illustrations - next/image's optimizer adds no value here.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={alt} className="h-full w-full object-cover" />
        )}
      </div>
      {isRemote && credit && (
        <p className="mt-1 text-right text-[11px] text-neutral-400">
          Photo by{" "}
          <a href={credit.photographerUrl} target="_blank" rel="noreferrer" className="underline">
            {credit.photographerName}
          </a>{" "}
          on{" "}
          <a href={credit.unsplashUrl} target="_blank" rel="noreferrer" className="underline">
            Unsplash
          </a>
        </p>
      )}
    </div>
  );
}
