"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, PlusCircle, Info, UserCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function NavBar() {
  const pathname = usePathname();
  const isChannelPage = pathname.startsWith("/channel/");

  const navItems: Array<{
    href: "/explore" | "/launch" | "/info" | "/profile";
    icon: typeof Compass;
    isActive: boolean;
  }> = [
    { href: "/explore", icon: Compass, isActive: pathname === "/explore" || pathname === "/" || isChannelPage },
    { href: "/launch", icon: PlusCircle, isActive: pathname === "/launch" },
    { href: "/info", icon: Info, isActive: pathname === "/info" },
    { href: "/profile", icon: UserCircle, isActive: pathname === "/profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex justify-center bg-zinc-800">
      <div
        className="flex w-full max-w-[520px] items-center justify-around bg-background px-8"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
          paddingTop: "12px",
        }}
      >
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className="flex items-center justify-center p-2">
            <item.icon
              className={cn(
                "h-6 w-6 transition-colors",
                item.isActive ? "text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
              strokeWidth={1.5}
            />
          </Link>
        ))}
      </div>
    </nav>
  );
}
