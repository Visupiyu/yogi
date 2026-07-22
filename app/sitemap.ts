import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://yomico.in",
      priority: 1,
    },

    {
      url: "https://yomico.in/store",
      priority: 0.9,
    },
  ];
}