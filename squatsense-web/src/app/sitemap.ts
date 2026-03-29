import type { MetadataRoute } from "next";

const BASE_URL = "https://squatsense.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${BASE_URL}/join`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.9 },
    { url: `${BASE_URL}/register`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE_URL}/leaderboard`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${BASE_URL}/setup`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
  ];
}
