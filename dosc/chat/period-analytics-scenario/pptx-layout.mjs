export const pieColors = ['#1557A0', '#2878B8', '#4A98D2', '#83B7E2', '#C3DDF1'];

export const summaryLayout = {
  total: { left: 815, top: 112, width: 390, height: 27 },
  top3Heading: { left: 818, top: 157, width: 380, height: 22 },
};

export const pieLegendLayout = {
  heading: { left: 545, top: 146, width: 245, height: 20 },
  markerX: 545,
  topicX: 565,
  metricX: 714,
  rowTop: 174,
  rowGap: 36,
};

export function pieLegendRows(report) {
  const total = report.pie.reduce((sum, value) => sum + value, 0);
  return report.topics.map((topic, index) => ({
    topic,
    count: report.pie[index] || 0,
    share: total ? Math.round((report.pie[index] || 0) / total * 100) : 0,
    color: pieColors[index % pieColors.length],
  }));
}

export function axisTicks(dataMaximum) {
  const maximum = Math.max(1, Number(dataMaximum) || 0);
  const rawStep = maximum / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  const step = multiplier * magnitude;
  return Array.from({ length: 6 }, (_, index) => Math.round(step * index));
}

export function lineValueLabelIndices(pointCount) {
  const stride = pointCount > 16 ? Math.ceil(pointCount / 10) : 1;
  const indices = Array.from({ length: pointCount }, (_, index) => index)
    .filter(index => index % stride === 0 || index === pointCount - 1);
  return indices;
}

export function lineValueLabels(report) {
  if (report.series.length !== 1 || report.series[0].name !== 'Все обращения') return [];
  return lineValueLabelIndices(report.periods.length).map(index => ({
    index,
    value: report.series[0].values[index],
  }));
}
