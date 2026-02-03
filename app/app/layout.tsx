import "@/app/globals.css";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";

const appDomain = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const heroImageUrl = `${appDomain}/media/hero.png`;
const splashImageUrl = `${appDomain}/media/splash.png`;
const baseAppId = process.env.NEXT_PUBLIC_BASE_APP_ID;

const miniAppEmbed = {
  version: "1",
  imageUrl: heroImageUrl,
  button: {
    title: "Open StickrNet",
    action: {
      type: "launch_miniapp" as const,
      name: "StickrNet",
      url: appDomain,
      splashImageUrl,
      splashBackgroundColor: "#000000",
    },
  },
};

export const metadata: Metadata = {
  title: "StickrNet",
  description: "Launch content channels, post Stickers, and collect onchain content.",
  openGraph: {
    title: "StickrNet",
    description: "Launch content channels, post Stickers, and collect onchain content.",
    url: appDomain,
    images: [
      {
        url: heroImageUrl,
      },
    ],
  },
  other: {
    "fc:miniapp": JSON.stringify(miniAppEmbed),
    ...(baseAppId ? { "base:app_id": baseAppId } : {}),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
