import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts/core';
import type { EChartsOption } from 'echarts';
import { useEffect, useRef } from 'react';

interface SeriesConfig {
  label: string;
  data: number[];
  color: string;
  dash?: boolean;
  yAxisIndex?: number;
}

interface FrequencyPlotProps {
  title: string;
  frequencies: number[];
  series: SeriesConfig[];
  yLabel: string;
  yMin?: number;
  yMax?: number;
  height?: number;
  /** Second Y-axis label (right side). Enables dual Y-axis when set. */
  y2Label?: string;
  y2Min?: number;
  y2Max?: number;
  /** Chart group name for cross-chart tooltip linking via echarts.connect() */
  group?: string;
}

export function FrequencyPlot({
  title,
  frequencies,
  series,
  yLabel,
  yMin,
  yMax,
  height = 250,
  y2Label,
  y2Min,
  y2Max,
  group,
}: FrequencyPlotProps) {
  const chartRef = useRef<ReactECharts>(null);

  // Connect charts in the same group for cross-chart tooltip linking
  useEffect(() => {
    if (group && chartRef.current) {
      const instance = chartRef.current.getEchartsInstance();
      instance.group = group;
      echarts.connect(group);
    }
  }, [group]);

  const hasDualAxis = !!y2Label;

  const yAxisConfig: EChartsOption['yAxis'] = hasDualAxis
    ? [
        {
          type: 'value',
          name: yLabel,
          nameLocation: 'middle',
          nameGap: 45,
          min: yMin,
          max: yMax,
        },
        {
          type: 'value',
          name: y2Label,
          nameLocation: 'middle',
          nameGap: 45,
          min: y2Min,
          max: y2Max,
        },
      ]
    : {
        type: 'value',
        name: yLabel,
        nameLocation: 'middle',
        nameGap: 45,
        min: yMin,
        max: yMax,
      };

  const option: EChartsOption = {
    title: {
      text: title,
      textStyle: { fontSize: 13, fontWeight: 'normal' },
      left: 'center',
      top: 4,
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: unknown) => {
        const p = params as { value: [number, number]; seriesName: string; color: string }[];
        if (!Array.isArray(p) || p.length === 0) return '';
        const freq = p[0].value[0];
        const freqStr = freq >= 1000 ? `${(freq / 1000).toFixed(2)}kHz` : `${freq.toFixed(1)}Hz`;
        const lines = p.map(
          (s) => `<span style="color:${s.color}">●</span> ${s.seriesName}: ${s.value[1].toFixed(2)}`
        );
        return `${freqStr}<br/>${lines.join('<br/>')}`;
      },
    },
    grid: { left: 60, right: hasDualAxis ? 60 : 20, top: 35, bottom: 35 },
    xAxis: {
      type: 'log',
      name: 'Hz',
      nameLocation: 'end',
      min: frequencies[0],
      max: frequencies[frequencies.length - 1],
      axisLabel: {
        formatter: (value: number) =>
          value >= 1000 ? `${value / 1000}k` : String(Math.round(value)),
      },
    },
    yAxis: yAxisConfig,
    series: series.map((s) => ({
      name: s.label,
      type: 'line' as const,
      showSymbol: false,
      yAxisIndex: s.yAxisIndex ?? 0,
      lineStyle: {
        width: 2,
        type: s.dash ? ('dashed' as const) : ('solid' as const),
      },
      data: frequencies.map((f, i) => [f, s.data[i]]),
      color: s.color,
    })),
    animation: false,
  };

  return (
    <ReactECharts
      ref={chartRef}
      option={option}
      style={{ height, width: '100%' }}
      notMerge
    />
  );
}
