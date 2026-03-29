"use client";

import dynamic from "next/dynamic";
import { memo } from "react";
import type { HoverData } from "./price-chart";

type PriceChartProps = {
  data: { time: number; value: number }[];
  isLoading?: boolean;
  color?: string;
  height?: number;
  onHover?: (data: HoverData) => void;
  tokenFirstActiveTime?: number;
  initialPrice?: number;
};

const PriceChartInner = dynamic(
  () => import("@/components/price-chart").then((mod) => mod.PriceChart),
  {
    ssr: false,
    loading: () => (
      <div
        className="w-full flex items-center justify-center bg-black"
        style={{ height: 200 }}
      >
        <div className="text-xs text-muted-foreground">Loading chart...</div>
      </div>
    ),
  }
);

export const LazyPriceChart = memo(function LazyPriceChart({
  data,
  isLoading = false,
  color = "#a1a1aa",
  height = 200,
  onHover,
  tokenFirstActiveTime,
  initialPrice,
}: PriceChartProps) {
  return (
    <PriceChartInner
      data={data}
      isLoading={isLoading}
      color={color}
      height={height}
      onHover={onHover}
      tokenFirstActiveTime={tokenFirstActiveTime}
      initialPrice={initialPrice}
    />
  );
});
