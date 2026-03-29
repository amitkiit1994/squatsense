import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/play", "/results", "/profile", "/arena/", "/kiosk-join/"],
      },
    ],
    sitemap: "https://squatsense.ai/sitemap.xml",
  };
}
