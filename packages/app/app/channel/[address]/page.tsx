import type { Metadata } from "next";
import { getChannel } from "@/lib/subgraph-launchpad";
import ChannelDetailPage from "./client-page";

const appDomain = process.env.NEXT_PUBLIC_APP_URL || "https://stickrnet.com";
const heroImageUrl = `${appDomain}/media/hero.png`;
const splashImageUrl = `${appDomain}/media/splash.png`;

type Props = {
  params: Promise<{ address: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const channelAddress = address.toLowerCase();

  // Fetch channel info from subgraph
  const channel = await getChannel(channelAddress);

  const tokenName = channel?.name || "Channel";
  const tokenSymbol = channel?.symbol || "TOKEN";
  const channelUrl = `${appDomain}/channel/${channelAddress}`;

  // Mini app embed with channel-specific URL
  const miniAppEmbed = {
    version: "1",
    imageUrl: heroImageUrl,
    button: {
      title: `$${tokenSymbol} on Stickrnet`,
      action: {
        type: "launch_miniapp" as const,
        name: "Stickrnet",
        url: channelUrl,
        splashImageUrl,
        splashBackgroundColor: "#000000",
      },
    },
  };

  return {
    title: `${tokenSymbol} | stickr.net`,
    description: `${tokenName} (${tokenSymbol}) on stickr.net. Collect content and earn rewards!`,
    openGraph: {
      title: `${tokenSymbol} | stickr.net`,
      description: `${tokenName} (${tokenSymbol}) on stickr.net. Collect content and earn rewards!`,
      url: channelUrl,
      images: [
        {
          url: heroImageUrl,
        },
      ],
    },
    other: {
      "fc:miniapp": JSON.stringify(miniAppEmbed),
    },
  };
}

export default function Page() {
  return <ChannelDetailPage />;
}
