"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getAccessToken } from "@/lib/auth"

interface AuthGuardProps {
  children: React.ReactNode
}

export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  async function checkAuth() {
    try {
      const token = getAccessToken()

      if (!token) {
        router.replace("/login")
        return
      }

      setIsAuthenticated(true)
    } catch {
      router.replace("/login")
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}
