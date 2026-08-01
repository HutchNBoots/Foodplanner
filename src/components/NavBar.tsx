"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

const links = [
  { href: "/", label: "This Week", icon: "🍽️" },
  { href: "/history", label: "History", icon: "🗓️" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (pathname === "/login") return null;

  function logout() {
    startTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <>
      <header className="sticky top-0 z-10 hidden items-center justify-between border-b border-ink-100 bg-paper-raised/90 px-6 py-3 backdrop-blur sm:flex">
        <Link
          href="/"
          className="font-display rounded-lg text-lg font-semibold text-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
        >
          🥗 Foodplanner
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <NavLink key={link.href} {...link} pathname={pathname} />
          ))}
          <button
            onClick={logout}
            disabled={isPending}
            className="ml-2 min-h-11 rounded-lg px-4 py-2 text-sm font-medium text-ink-500 transition hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            Log out
          </button>
        </nav>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-ink-100 bg-paper-raised/95 backdrop-blur sm:hidden">
        {links.map((link) => (
          <NavLink key={link.href} {...link} pathname={pathname} mobile />
        ))}
        <button
          onClick={logout}
          disabled={isPending}
          className="flex min-h-11 flex-1 flex-col items-center gap-0.5 py-2.5 text-xs text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-800"
        >
          <span className="text-lg leading-none">🚪</span>
          Log out
        </button>
      </nav>
    </>
  );
}

function NavLink({
  href,
  label,
  icon,
  pathname,
  mobile,
}: {
  href: string;
  label: string;
  icon: string;
  pathname: string;
  mobile?: boolean;
}) {
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  if (mobile) {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className="flex min-h-11 flex-1 flex-col items-center gap-0.5 py-2.5 text-xs text-ink-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink-800"
      >
        <span
          className={`relative text-lg leading-none ${active ? "" : "opacity-60"}`}
        >
          {icon}
          {active && (
            <span aria-hidden className="absolute -top-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-ink-800" />
          )}
        </span>
        <span className={active ? "font-semibold text-ink-800" : ""}>{label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`min-h-11 rounded-lg px-4 py-2 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink-800 focus-visible:ring-offset-2 focus-visible:ring-offset-paper ${
        active ? "bg-ink-100 text-ink-800" : "text-ink-600 hover:bg-ink-50"
      }`}
    >
      {label}
    </Link>
  );
}
