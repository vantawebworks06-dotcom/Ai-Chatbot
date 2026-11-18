"use client";

import {
  BookOpen,
  Bot,
  Code2,
  Headset,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Settings,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { VeloraLogo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const BUSINESS_NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/dashboard/knowledge", label: "Knowledge base", icon: BookOpen },
  { href: "/dashboard/chatbot", label: "Chatbot", icon: Bot },
  { href: "/dashboard/install", label: "Install", icon: Code2 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function AppShell({
  businessName,
  email,
  isAgent,
  children,
}: {
  businessName: string;
  email: string;
  isAgent: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 px-3">
      {BUSINESS_NAV.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium transition-colors",
              active ? "bg-subtle text-ink" : "text-ink-2 hover:bg-subtle/70 hover:text-ink",
            )}
          >
            <Icon className={cn("h-4 w-4", active ? "text-brand" : "text-faint")} strokeWidth={2} />
            {item.label}
          </Link>
        );
      })}
      {isAgent ? (
        <>
          <div className="mx-2.5 my-3 h-px bg-line" />
          <Link
            href="/agent"
            className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] font-medium text-ink-2 hover:bg-subtle/70 hover:text-ink"
          >
            <Headset className="h-4 w-4 text-ai" />
            Agent inbox
          </Link>
        </>
      ) : null}
    </nav>
  );

  const footer = (
    <div className="border-t border-line p-3">
      <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
        <div className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-brand-soft text-[13px] font-semibold text-brand">
          {businessName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-ink">{businessName}</p>
          <p className="truncate text-xs text-muted">{email}</p>
        </div>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            title="Sign out"
            aria-label="Sign out"
            className="grid h-8 w-8 place-items-center rounded-lg text-faint hover:bg-subtle hover:text-ink"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-60">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center px-5">
          <Link href="/dashboard">
            <VeloraLogo size="sm" />
          </Link>
        </div>
        <div className="pt-2" />
        {nav}
        {footer}
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-surface/90 px-4 backdrop-blur lg:hidden">
        <Link href="/dashboard">
          <VeloraLogo size="sm" />
        </Link>
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-subtle"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setOpen(false)} />
          <aside className="animate-in absolute inset-y-0 left-0 flex w-72 flex-col bg-surface shadow-[var(--shadow-pop)]">
            <div className="flex h-14 items-center justify-between px-5">
              <VeloraLogo size="sm" />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="grid h-9 w-9 place-items-center rounded-lg text-ink-2 hover:bg-subtle"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      ) : null}

      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <div className="min-h-screen lg:pl-60">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-line bg-surface lg:block" />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="h-6 w-40 animate-pulse rounded bg-subtle" />
        <div className="mt-6 h-40 animate-pulse rounded-xl bg-subtle" />
      </div>
    </div>
  );
}
