import Link from "next/link";
import LogoutButton from "@/app/components/LogoutButton";
import { isOwnerLoggedIn } from "@/lib/ownerAuth";

const links = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "NBA" },
  { href: "/mlb", label: "MLB" },
  { href: "/picks", label: "Picks" },
  { href: "/calendar", label: "Calendar" },
  { href: "/performance", label: "Performance" },
];

export default async function Navbar() {
  const isOwner = await isOwnerLoggedIn();

  return (
    <nav className="sticky top-0 z-50 border-b border-white/40 bg-white/65 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3 flex-wrap">
        <div className="mr-3 rounded-full border border-teal-600/20 bg-teal-600/10 px-3 py-1 text-sm font-semibold text-teal-900">
          Betting Lab
        </div>
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-full border border-transparent px-3 py-2 text-sm font-medium text-slate-700 hover:border-teal-700/15 hover:bg-white/80 hover:text-slate-950"
          >
            {link.label}
          </Link>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {isOwner ? (
            <>
              <div className="rounded-full border border-emerald-700/15 bg-emerald-600/10 px-3 py-2 text-sm font-medium text-emerald-900">
                Owner
              </div>
              <LogoutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-full border border-teal-700/15 bg-white/80 px-3 py-2 text-sm font-medium text-slate-700 hover:border-teal-700/20 hover:bg-white"
            >
              Login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
