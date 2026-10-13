import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAnalyticsPptx } from "../pptx-generator.mjs";
import { finalizeSample } from "./finalize-sample.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const monthNames = ["июл", "авг", "сен", "окт"];
const periods = Array.from({ length: 13 }, (_, index) => {
  const start = new Date(2026, 6, 6 + index * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const startText = `${String(start.getDate()).padStart(2, "0")}`;
  const endText = `${String(end.getDate()).padStart(2, "0")}`;
  const label = start.getMonth() === end.getMonth()
    ? `${startText}–${endText} ${monthNames[start.getMonth() - 6]}`
    : `${startText} ${monthNames[start.getMonth() - 6]}–${endText} ${monthNames[end.getMonth() - 6]}`;
  return { start, end, label };
});

function weeklyReport(kind, title, topics, pie, baseValues) {
  const series = topics.map((name, topicIndex) => ({
    name,
    values: periods.map((_, periodIndex) => {
      const trend = 0.88 + periodIndex * 0.018;
      const weeklyVariation = 0.91 + ((periodIndex * 7 + topicIndex * 11) % 17) / 100;
      return Math.round(baseValues[topicIndex] * trend * weeklyVariation);
    }),
  }));
  const totals = periods.map((_, periodIndex) => series.reduce((sum, row) => sum + row.values[periodIndex], 0));
  return {
    kind,
    title,
    product: "ОМС",
    year: 2026,
    month: 9,
    monthName: "сентябрь",
    detail: "week",
    chartType: "histogram",
    range: "06.07.2026 — 04.10.2026",
    topics,
    pie,
    periods: periods.map(period => period.label),
    series,
    totals,
  };
}

const reports = [
  weeklyReport("toxic", "Жалобы",
    ["Списание средств", "Переводы", "Комиссии", "Приложение", "Прочее"],
    [320, 260, 185, 140, 80], [72, 61, 43, 33, 19]),
  weeklyReport("consultation", "Консультации",
    ["Карты и счета", "Переводы", "Вклады", "Бонусы", "Прочее"],
    [220, 190, 150, 120, 100], [51, 44, 35, 28, 23]),
];

const buildDirectory = path.resolve(directory, "..", ".pptx-build");
await fs.mkdir(buildDirectory, { recursive: true });
const candidatePath = path.join(buildDirectory, "weekly-candidate-legend.pptx");
const presentation = await createAnalyticsPptx(reports, candidatePath);
for (const [index, slide] of presentation.slides.items.entries()) {
  const image = await presentation.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(buildDirectory, `weekly-legend-slide-${index + 1}.png`), new Uint8Array(await image.arrayBuffer()));
}
console.log(await finalizeSample(candidatePath, "analytics-weekly-synthetic-sample.pptx"));
