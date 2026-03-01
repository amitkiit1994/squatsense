"use client";

import { useEffect, useState } from "react";

const CONSENT_KEY = "squatsense_cookie_consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      setVisible(true);
    }
  }, []);

  function accept() {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setVisible(false);
  }

  function decline() {
    localStorage.setItem(CONSENT_KEY, "declined");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-zinc-900 border-t border-zinc-700 shadow-lg">
      <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-sm text-zinc-300 flex-1">
          We use essential cookies to keep you signed in and store your
          preferences. No third-party tracking cookies are used. By continuing,
          you agree to our use of cookies.{" "}
          <a href="/privacy" className="underline text-blue-400 hover:text-blue-300">
            Privacy Policy
          </a>
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={decline}
            className="px-4 py-2 text-sm rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Decline
          </button>
          <button
            onClick={accept}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
