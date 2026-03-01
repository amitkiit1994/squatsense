"use client"

import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Dumbbell, Play, BarChart3, User } from "lucide-react"

import { cn } from "@/lib/utils"

const navItems = [
  {
    label: "Home",
    href: "/dashboard",
    icon: Home,
  },
  {
    label: "Exercises",
    href: "/exercises",
    icon: Dumbbell,
  },
  {
    label: "Workout",
    href: "/workout",
    icon: Play,
    prominent: true,
  },
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    label: "Profile",
    href: "/settings",
    icon: User,
  },
]

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname()

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Aurora blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="animate-aurora absolute -top-1/3 left-1/4 h-[600px] w-[600px] rounded-full bg-violet-600/8 blur-[120px]" />
        <div className="animate-aurora-slow absolute -bottom-1/4 right-1/4 h-[400px] w-[400px] rounded-full bg-blue-600/6 blur-[100px]" />
      </div>
      {/* Grid overlay */}
      <div className="pointer-events-none fixed inset-0 -z-10 bg-grid" />

      {/* Scrollable content area */}
      <main className="relative z-0 flex-1 overflow-y-auto" role="main">{children}</main>

      {/* Bottom navigation */}
      <nav className="sticky bottom-0 z-50 border-t border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl" aria-label="Main navigation" role="navigation">
        <div className="flex h-16 items-center justify-around px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
            const Icon = item.icon

            if (item.prominent) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center justify-center"
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                >
                  <div
                    className={cn(
                      "flex h-12 w-12 items-center justify-center rounded-full shadow-lg shadow-violet-600/30 transition-colors",
                      isActive
                        ? "bg-violet-600 text-white"
                        : "bg-violet-600/90 text-white hover:bg-violet-600"
                    )}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <span
                    className={cn(
                      "mt-0.5 text-[10px] font-medium",
                      isActive ? "text-violet-400" : "text-zinc-500"
                    )}
                  >
                    {item.label}
                  </span>
                </Link>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 px-3 py-1 transition-colors",
                  isActive
                    ? "text-violet-400"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
