import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sunset Group Dashboard",
    short_name: "Sunset Call",
    description:
      "Enterprise dashboard for tracking daily call activity, meetings, sales, collections, and commitments.",
    start_url: "/",
    id: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#10b981",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/maskable-icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    categories: ["business", "productivity"],
    shortcuts: [
      {
        name: "Daily Calls",
        short_name: "Calls",
        description: "Log and track daily calling activity",
        url: "/calls",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192" }],
      },
      {
        name: "Daily Reports",
        short_name: "Reports",
        description: "View employee daily reports",
        url: "/reports",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192" }],
      },
    ],
  };
}

