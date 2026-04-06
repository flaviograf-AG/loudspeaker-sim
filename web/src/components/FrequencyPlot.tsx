import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';

interface SeriesConfig {
  label: string;
  data: number[];
  color: string;
  dash?: boolean;
}

interface FrequencyPlotProps {
  title: string;
  frequencies: number[];
  series: SeriesConfig[];
  yLabel: string;
  yMin?: number;
  yMax?: number;
  height?: number;
}

export function FrequencyPlot({
  title,
  frequencies,
  series,
  yLabel,
  yMin,
  yMax,
  height = 250,
}: FrequencyPlotProps) {
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
    grid: { left: 60, right: 20, top: 35, bottom: 35 },
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
    yAxis: {
      type: 'value',
      name: yLabel,
      nameLocation: 'middle',
      nameGap: 45,
      min: yMin,
      max: yMax,
    },
    series: series.map((s) => ({
      name: s.label,
      type: 'line' as const,
      showSymbol: false,
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
      option={option}
      style={{ height, width: '100%' }}
      notMerge
    />
  );
}
