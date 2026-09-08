import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://tubescout-app.vercel.app/"),
  title: "TubeScout — YouTube Competitor Research Tool",
  description: "Research YouTube competitor metadata and turn reference patterns into original video concepts, titles, visual prompts, descriptions, keywords and hashtags.",
  applicationName: "TubeScout",
  alternates: { canonical: "https://tubescout-app.vercel.app/" },
  openGraph: {
    type: "website",
    url: "https://tubescout-app.vercel.app/",
    siteName: "TubeScout",
    title: "TubeScout — YouTube Competitor Research Tool",
    description: "Research YouTube competitor metadata and turn reference patterns into original video concepts, titles, visual prompts, descriptions, keywords and hashtags.",
    images: [{
      url: "/splash-screen.png",
      width: 1254,
      height: 1254,
      alt: "TubeScout — YouTube Competitor Research Tool"
    }]
  },
  twitter: {
    card: "summary_large_image",
    title: "TubeScout — YouTube Competitor Research Tool",
    description: "Research YouTube competitor metadata and turn reference patterns into original video concepts, titles, visual prompts, descriptions, keywords and hashtags.",
    images: ["/splash-screen.png"]
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/favicon-48.png", sizes: "48x48", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = { themeColor: "#e50914", colorScheme: "dark light", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>{children}</body></html>;
}
