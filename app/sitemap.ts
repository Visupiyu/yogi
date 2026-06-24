import type {
  MetadataRoute
} from "next";

export default function sitemap():
MetadataRoute.Sitemap {

  return [

    {
      url:
        "https://your-domain.com",
      priority: 1,
    },

    {
      url:
        "https://your-domain.com/store",
      priority: 0.9,
    },

  ];

}