import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ultra League OS — Scoring",
    short_name: "UltraOS",
    description: "Offline-capable match scoring for Ultra League OS.",
    start_url: "/",
    display: "standalone",
    orientation: "landscape",
    background_color: "#0b100e",
    theme_color: "#0b100e",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
