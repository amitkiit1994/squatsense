"use client"

import React, { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "@/lib/auth"

interface AuthGuardProps {
  children: React.ReactNode
}

/**
 * Decode a JWT payload without verification (client-side expiry check only).
 * Returns null if the token is malformed.
 */
function decodeTokenPayload(token: string): { exp?: number; sub?: string } | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")))
    return payload
  } catch {
    return null
  }
}

/**
 * Check if a JWT is expired (with 30s buffer to avoid edge-case races).
 */
function isTokenExpired(token: string): boolean {
  const payload = decodeTokenPayload(token)
  if (!payload?.exp) return true
  return payload.exp * 1000 < Date.now() + 30_000
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

      // If access token is expired, attempt a silent refresh
      if (isTokenExpired(token)) {
        const refreshToken = getRefreshToken()
        if (!refreshToken) {
          clearTokens()
          router.replace("/login")
          return
        }

        try {
          const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? ""
          const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshToken }),
          })

          if (!res.ok) {
            clearTokens()
            router.replace("/login")
            return
          }

          const data = await res.json()
          setTokens(data.access_token, data.refresh_token)
        } catch {
          clearTokens()
          router.replace("/login")
          return
        }
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
