"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, LineSeries, type IChartApi, type ISeriesApi, type Time, LineStyle } from "lightweight-charts";

export type HoverData = {
  time: number;
  value: number;
} | null;

type PriceChartProps = {
  data: { time: number; value: number }[];
  isLoading?: boolean;
  color?: string;
  height?: number;
  onHover?: (data: HoverData) => void;
  tokenFirstActiveTime?: number;
  initialPrice?: number;
};

export function PriceChart({
  data,
  isLoading = false,
  color = "#a1a1aa",
  height = 200,
  onHover,
  tokenFirstActiveTime,
  initialPrice,
}: PriceChartProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!mounted || !wrapperRef.current || !chartContainerRef.current || isLoading) return;

    const wrapper = wrapperRef.current;
    const container = chartContainerRef.current;
    const visibleWidth = wrapper.clientWidth;
    if (visibleWidth === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    try {
      const realData = data.filter(d => d.value > 0);
      const numBars = realData.length;

      // lightweight-charts centers each bar in its pixel slot, leaving half-bar
      // padding on each edge. To eliminate this, make the chart wider than the
      // visible area and shift it left so the padding falls outside the clip.
      const extra = numBars > 1 ? Math.ceil(visibleWidth / (2 * numBars)) + 1 : 0;
      const chartWidth = visibleWidth + extra * 2;

      container.style.width = `${chartWidth}px`;
      container.style.marginLeft = `-${extra}px`;

      const chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "#9f9992",
          fontFamily: "Inter, sans-serif",
          attributionLogo: false,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
        width: chartWidth,
        height: height,
        handleScroll: false,
        handleScale: false,
        rightPriceScale: {
          visible: false,
          borderVisible: false,
          scaleMargins: {
            top: 0.1,
            bottom: 0.15,
          },
        },
        leftPriceScale: {
          visible: false,
          borderVisible: false,
        },
        timeScale: {
          visible: false,
          borderVisible: false,
          rightOffset: 0,
        },
        crosshair: {
          vertLine: {
            visible: true,
            labelVisible: false,
            color: "rgba(229, 226, 225, 0.18)",
            width: 1,
            style: 2,
          },
          horzLine: {
            visible: false,
            labelVisible: false,
          },
        },
      });

      let priceSeries: ISeriesApi<"Line"> | null = null;
      let baselineSeries: ISeriesApi<"Line"> | null = null;

      if (realData.length > 0 && tokenFirstActiveTime) {
        const preData = realData.filter(d => d.time < tokenFirstActiveTime);
        const postData = realData.filter(d => d.time >= tokenFirstActiveTime);

        if (preData.length > 0 && postData.length > 0) {
          const baselinePrice = initialPrice && initialPrice > 0 ? initialPrice : postData[0].value;
          const baselineData = [
            ...preData.map(d => ({ time: d.time as Time, value: baselinePrice })),
            { time: postData[0].time as Time, value: baselinePrice },
          ];

          baselineSeries = chart.addSeries(LineSeries, {
            color: "#52525b",
            lineStyle: LineStyle.Dashed,
            lineWidth: 1,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          baselineSeries.applyOptions({
            color: "rgba(159, 153, 146, 0.65)",
          });
          baselineSeries.setData(baselineData);

          priceSeries = chart.addSeries(LineSeries, {
            color: color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          // Start price series from initialPrice so the line begins at the true launch price
          const priceData = postData.map(d => ({ time: d.time as Time, value: d.value }));
          if (initialPrice && initialPrice > 0 && priceData.length > 0 && priceData[0].value !== initialPrice) {
            priceData[0] = { ...priceData[0], value: initialPrice };
          }
          priceSeries.setData(priceData);
        } else {
          priceSeries = chart.addSeries(LineSeries, {
            color: color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          });
          priceSeries.setData(realData.map(d => ({ time: d.time as Time, value: d.value })));
        }
      } else if (realData.length > 0) {
        priceSeries = chart.addSeries(LineSeries, {
          color: color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
        priceSeries.setData(realData.map(d => ({ time: d.time as Time, value: d.value })));
      }

      chart.timeScale().fitContent();
      chartRef.current = chart;

      // Handle hover
      chart.subscribeCrosshairMove((param) => {
        if (!onHover) return;

        if (!param.time || !param.point || param.point.x < 0 || param.point.y < 0) {
          onHover(null);
          return;
        }

        if (priceSeries) {
          const seriesData = param.seriesData.get(priceSeries);
          if (seriesData && "value" in seriesData) {
            onHover({
              time: param.time as number,
              value: seriesData.value as number,
            });
            return;
          }
        }

        // Fall back to baseline series (dashed line in pre-existence period)
        if (baselineSeries) {
          const baseData = param.seriesData.get(baselineSeries);
          if (baseData && "value" in baseData) {
            onHover({
              time: param.time as number,
              value: baseData.value as number,
            });
            return;
          }
        }

        onHover({
          time: param.time as number,
          value: 0,
        });
      });

    } catch {
      // Chart creation failed — silently ignore
    }

    const handleResize = () => {
      if (chartRef.current && wrapper.clientWidth > 0) {
        const realData = data.filter(d => d.value > 0);
        const numBars = realData.length;
        const newVisibleWidth = wrapper.clientWidth;
        const newExtra = numBars > 1 ? Math.ceil(newVisibleWidth / (2 * numBars)) + 1 : 0;
        const newChartWidth = newVisibleWidth + newExtra * 2;
        container.style.width = `${newChartWidth}px`;
        container.style.marginLeft = `-${newExtra}px`;
        chartRef.current.applyOptions({ width: newChartWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      // Reset container styles
      container.style.width = "";
      container.style.marginLeft = "";
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
  }, [mounted, color, height, data, isLoading, onHover, tokenFirstActiveTime, initialPrice]);

  return (
    <div ref={wrapperRef} style={{ height }} className="w-full relative overflow-hidden">
      <div ref={chartContainerRef} className="h-full" />
    </div>
  );
}
