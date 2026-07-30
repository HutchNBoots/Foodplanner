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
      <header className="sticky top-0 z-10 hidden items-center justify-between border-b border-neutral-200 bg-white/90 px-6 py-3 backdrop-blur sm:flex">
        <Link href="/" className="text-lg font-semibold text-brand-700">
          🥗 Foodplanner
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <NavLink key={link.href} {...link} pathname={pathname} />
          ))}
          <button
            onClick={logout}
            disabled={isPending}
            className="ml-2 rounded-full px-4 py-2 text-sm font-medium text-neutral-500 hover:bg-neutral-100"
          >
            Log out
          </button>
        </nav>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-neutral-200 bg-white/95 backdrop-blur sm:hidden">
        {links.map((link) => (
          <NavLink key={link.href} {...link} pathname={pathname} mobile />
        ))}
        <button
          onClick={logout}
          disabled={isPending}
          className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs text-neutral-500"
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
        className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs ${
          active ? "text-brand-600" : "text-neutral-500"
        }`}
      >
        <span className="text-lg leading-none">{icon}</span>
        {label}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-medium ${
        active ? "bg-brand-50 text-brand-700" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {label}
    </Link>
  );
}
