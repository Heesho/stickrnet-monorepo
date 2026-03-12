"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutGrid, Plus, Info } from "lucide-react";
import { useFarcaster } from "@/hooks/useFarcaster";

function ProfileIcon({ isActive }: { isActive: boolean }) {
  const { user, address } = useFarcaster();
  const pfpUrl = user?.pfpUrl;
  const fallback = address ? address.slice(-2).toUpperCase() : "??";

  return (
    <div
      className={cn(
        "w-7 h-7 rounded-full overflow-hidden flex items-center justify-center transition-all",
        pfpUrl
          ? isActive ? "ring-2 ring-white" : "opacity-60 hover:opacity-90"
          : isActive
            ? "bg-white text-black"
            : "bg-zinc-800 text-zinc-400 hover:bg-zinc-800"
      )}
    >
      {pfpUrl ? (
        <img src={pfpUrl} alt="Profile" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[10px] font-mono font-semibold">{fallback}</span>
      )}
    </div>
  );
}

export function NavBar() {
  const pathname = usePathname();

  const isChannelPage = pathname.startsWith("/channel/");

  const iconItems: Array<{
    href: "/explore" | "/launch" | "/info";
    icon: typeof LayoutGrid;
    isActive: boolean;
  }> = [
    { href: "/explore", icon: LayoutGrid, isActive: pathname === "/explore" || pathname === "/" || isChannelPage },
    { href: "/launch", icon: Plus, isActive: pathname === "/launch" },
    { href: "/info", icon: Info, isActive: pathname === "/info" },
  ];

  const isProfileActive = pathname === "/profile";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center bg-zinc-800"
    >
      <div
        className="flex justify-around items-center w-full max-w-[520px] bg-background px-8"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          paddingTop: "12px",
        }}
      >
        {iconItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex-1 flex items-center justify-center min-h-[48px] transition-colors"
          >
            <item.icon
              className={cn(
                "w-6 h-6 transition-colors",
                item.isActive
                  ? "text-white"
                  : "text-zinc-400 hover:text-zinc-400"
              )}
              strokeWidth={1.5}
            />
          </Link>
        ))}
        <Link
          href="/profile"
          className="flex-1 flex items-center justify-center min-h-[48px] transition-colors"
        >
          <ProfileIcon isActive={isProfileActive} />
        </Link>
      </div>
    </nav>
  );
}
