"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import type { AIChartDatum, AIChartSeries, ParsedAIChart } from "./chart-block";

const DEFAULT_CHART_HEIGHT = 280;
const DEFAULT_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#0891b2",
  "#16a34a",
  "#f97316",
  "#dc2626",
  "#9333ea",
  "#0f766e",
] as const;
const CHART_MARGIN = { top: 12, right: 12, bottom: 0, left: 0 } as const;
const MIN_BAR_WIDTH_PERCENT = 3;

function getChartConfig(series: AIChartSeries[]): ChartConfig {
  return series.reduce<ChartConfig>((config, item) => {
    config[item.key] = {
      label: item.label,
      color: item.color,
    };
    return config;
  }, {});
}

function getCssColor(key: string): string {
  return `var(--color-${key})`;
}

function getSeriesColor(series: AIChartSeries): string {
  return series.color || getCssColor(series.key);
}

function formatLegendValue(value: string | number | null | undefined): string {
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "string") return value;
  return "";
}

function getNumericValue(row: AIChartDatum, key: string): number | null {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getBarChartHeight(chart: ParsedAIChart): number {
  if (chart.type !== "bar") return DEFAULT_CHART_HEIGHT;
  return Math.max(DEFAULT_CHART_HEIGHT, Math.min(560, chart.data.length * 42 + 84));
}

function getDisplayLabel(row: AIChartDatum, key: string): string {
  return formatLegendValue(row[key]) || "Untitled";
}

function SingleSeriesBarList({ chart }: { chart: ParsedAIChart }) {
  const series = chart.series[0];
  if (!series) return null;

  const numericRows = chart.data
    .map((row) => ({ row, value: getNumericValue(row, series.key) }))
    .filter((item): item is { row: AIChartDatum; value: number } => item.value !== null);

  if (numericRows.length === 0) {
    return null;
  }

  const maxValue = Math.max(...numericRows.map((item) => item.value), 0);

  return (
    <div
      className="space-y-3"
      role="img"
      aria-label={`${chart.title ?? "Chart"}: ${numericRows
        .map((item) => `${getDisplayLabel(item.row, chart.xKey)} ${formatLegendValue(item.value)}`)
        .join(", ")}`}
    >
      {numericRows.map(({ row, value }, index) => {
        const label = getDisplayLabel(row, chart.xKey);
        const width = maxValue > 0
          ? Math.max((value / maxValue) * 100, value > 0 ? MIN_BAR_WIDTH_PERCENT : 0)
          : 0;

        return (
          <div key={`${label}-${index}`} className="grid gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-xs">
              <span className="min-w-0 truncate font-medium text-[color:var(--color-foreground)]" title={label}>
                {label}
              </span>
              <span className="shrink-0 font-mono tabular-nums text-[color:var(--color-muted-foreground)]">
                {formatLegendValue(value)}
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-[color:var(--color-muted)]/70">
              <div
                className="h-full rounded-full shadow-[0_0_14px_rgba(37,99,235,0.35)]"
                style={{
                  width: `${width}%`,
                  background: `linear-gradient(90deg, ${series.color}, ${series.color}cc)`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CartesianChart({ chart }: { chart: ParsedAIChart }) {
  const shouldShowLegend = chart.series.length > 1;
  const gradientIdPrefix = React.useId().replace(/:/g, "");

  const common = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis
        dataKey={chart.xKey}
        tickLine={false}
        axisLine={false}
        tickMargin={8}
        minTickGap={18}
      />
      <YAxis tickLine={false} axisLine={false} tickMargin={8} width={42} />
      <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
      {shouldShowLegend && <ChartLegend content={<ChartLegendContent />} />}
    </>
  );

  if (chart.type === "line") {
    return (
      <LineChart data={chart.data} margin={CHART_MARGIN}>
        {common}
        {chart.series.map((series) => (
          <Line
            key={series.key}
            type="monotone"
            dataKey={series.key}
            stroke={getSeriesColor(series)}
            strokeWidth={2.5}
            dot={{ r: 2.5 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    );
  }

  if (chart.type === "area") {
    return (
      <AreaChart data={chart.data} margin={CHART_MARGIN}>
        <defs>
          {chart.series.map((series) => (
            <linearGradient key={series.key} id={`fill-${gradientIdPrefix}-${series.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={getSeriesColor(series)} stopOpacity={0.42} />
              <stop offset="95%" stopColor={getSeriesColor(series)} stopOpacity={0.04} />
            </linearGradient>
          ))}
        </defs>
        {common}
        {chart.series.map((series) => (
          <Area
            key={series.key}
            type="monotone"
            dataKey={series.key}
            stroke={getSeriesColor(series)}
            strokeWidth={2.2}
            fill={`url(#fill-${gradientIdPrefix}-${series.key})`}
          />
        ))}
      </AreaChart>
    );
  }

  return (
    <BarChart data={chart.data} margin={CHART_MARGIN}>
      {common}
      {chart.series.map((series) => (
        <Bar key={series.key} dataKey={series.key} fill={getSeriesColor(series)} radius={[6, 6, 0, 0]} />
      ))}
    </BarChart>
  );
}

function PieChartBlock({ chart }: { chart: ParsedAIChart }) {
  const series = chart.series[0];
  if (!series) return null;

  const pieData: Array<AIChartDatum & { fill: string }> = chart.data.map((row, index) => ({
    ...row,
    fill: DEFAULT_COLORS[index % DEFAULT_COLORS.length],
  }));

  return (
    <div className="space-y-3">
      <ChartContainer config={getChartConfig(chart.series)} className="h-[260px] w-full">
        <PieChart>
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel nameKey={chart.xKey} />} />
          <Pie
            data={pieData}
            dataKey={series.key}
            nameKey={chart.xKey}
            innerRadius={58}
            outerRadius={92}
            paddingAngle={2}
          >
            {pieData.map((row, index) => (
              <Cell key={`${formatLegendValue(row[chart.xKey])}-${index}`} fill={row.fill} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>

      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-[color:var(--color-muted-foreground)]">
        {pieData.map((row, index) => (
          <span key={`${formatLegendValue(row[chart.xKey])}-legend-${index}`} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: row.fill }} />
            <span>{formatLegendValue(row[chart.xKey])}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function AIChartBlock({ chart, className }: { chart: ParsedAIChart; className?: string }) {
  const config = React.useMemo(() => getChartConfig(chart.series), [chart.series]);
  const useBarList = chart.type === "bar" && chart.series.length === 1;

  return (
    <figure
      className={cn(
        "not-prose my-4 w-full min-w-0 overflow-hidden rounded-2xl border border-[color:var(--color-border)] bg-[color:var(--color-card)]/85 p-4 shadow-sm",
        className,
      )}
    >
      {(chart.title || chart.description) && (
        <figcaption className="mb-3 space-y-1">
          {chart.title && <h4 className="text-sm font-semibold text-[color:var(--color-foreground)]">{chart.title}</h4>}
          {chart.description && <p className="text-xs text-[color:var(--color-muted-foreground)]">{chart.description}</p>}
        </figcaption>
      )}

      {useBarList ? (
        <SingleSeriesBarList chart={chart} />
      ) : chart.type === "pie" ? (
        <PieChartBlock chart={chart} />
      ) : (
        <ChartContainer
          config={config}
          className="min-h-[280px] min-w-0 w-full"
          style={{ height: getBarChartHeight(chart) }}
        >
          <CartesianChart chart={chart} />
        </ChartContainer>
      )}
    </figure>
  );
}
