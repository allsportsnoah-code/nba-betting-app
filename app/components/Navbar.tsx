import Link from "next/link";
import LogoutButton from "@/app/components/LogoutButton";
import { isOwnerLoggedIn } from "@/lib/ownerAuth";

const links = [
  { href: "/", label: "Home" },
  { href: "/dashboard?day=today&propType=pra", label: "NBA" },
  { href: "/mlb", label: "MLB" },
  { href: "/nfl", label: "NFL" },
  { href: "/soccer", label: "Soccer" },
  { href: "/picks", label: "Picks" },
  { href: "/calendar", label: "Calendar" },
  { href: "/performance", label: "Performance" },
  { href: "/grades", label: "Grades" },
];

export default async function Navbar() {
  const isOwner = await isOwnerLoggedIn();
  const navLinks = isOwner ? [...links, { href: "/owner", label: "Owner" }] : links;

  return (
    <nav className="sticky top-0 z-50 border-b border-white/50 bg-[rgba(247,251,252,0.82)] backdrop-blur-2xl">
      <div className="mx-auto flex max-w-[88rem] flex-wrap items-center gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-4">
        <div className="min-w-0 sm:min-w-[10rem]">
          <div className="hidden text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-500 sm:block">
            Adaptive sports workspace
          </div>
          <Link href="/" className="block text-base font-semibold text-slate-950 sm:mt-1 sm:text-lg">
            Betting Lab
          </Link>
        </div>
        <div className="mobile-nav-scroll order-3 -mx-1 flex w-[calc(100%+0.5rem)] flex-nowrap gap-1 overflow-x-auto px-1 pb-1 sm:order-none sm:mx-0 sm:w-auto sm:flex-1 sm:flex-wrap sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="app-pill shrink-0 rounded-full px-2.5 py-1.5 text-[0.78rem] font-medium text-slate-700 hover:text-slate-950 sm:px-3 sm:py-2 sm:text-sm"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {isOwner ? (
            <>
              <div className="app-pill rounded-full px-2.5 py-1.5 text-[0.78rem] font-medium text-emerald-900 sm:px-3 sm:py-2 sm:text-sm">
                Owner
              </div>
              <LogoutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="app-pill rounded-full px-2.5 py-1.5 text-[0.78rem] font-medium text-slate-700 hover:text-slate-950 sm:px-3 sm:py-2 sm:text-sm"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
