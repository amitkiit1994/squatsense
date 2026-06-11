import type { Metadata } from "next";

/**
 * Admin section layout.
 *
 * Server component whose only job is to attach noindex metadata to every
 * route under /admin so founder tooling never appears in search engines.
 */
export const metadata: Metadata = {
  title: "Admin — FreeForm Fitness",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
