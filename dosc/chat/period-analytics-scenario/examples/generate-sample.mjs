import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAnalyticsPptx } from "../pptx-generator.mjs";
import { finalizeSample } from "./finalize-sample.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен"];

function report(kind, title, topics, pie, startValues) {
  const series = topics.map((name, index) => ({
    name,
    values: [...startValues[index], pie[index]],
  }));
  const totals = months.map((_, periodIndex) => series.reduce((sum, row) => sum + row.values[periodIndex], 0));
  return {
    kind,
    title,
    product: "ОМС",
    year: 2026,
    month: 9,
    monthName: "сентябрь",
    detail: "month",
    chartType: "histogram",
    range: "Январь — сентябрь 2026",
    topics,
    pie,
    periods: months,
    series,
    totals,
  };
}

const reports = [
  report("toxic", "Жалобы",
    ["Списание средств", "Переводы", "Комиссии", "Приложение", "Прочее"],
    [320, 260, 185, 140, 80],
    [[205, 220, 240, 255, 260, 275, 280, 300], [190, 195, 215, 210, 225, 235, 240, 250], [130, 140, 155, 160, 165, 170, 172, 180], [115, 120, 123, 125, 130, 132, 136, 139], [70, 72, 75, 73, 76, 78, 80, 82]]),
  report("consultation", "Консультации",
    ["Карты и счета", "Переводы", "Вклады", "Бонусы", "Прочее"],
    [220, 190, 150, 120, 100],
    [[180, 190, 198, 205, 210, 215, 217, 219], [165, 170, 175, 180, 183, 186, 188, 189], [132, 135, 138, 140, 142, 145, 148, 149], [98, 102, 105, 108, 112, 115, 117, 119], [91, 92, 94, 96, 97, 98, 99, 100]]),
];

const buildDirectory = path.resolve(directory, "..", ".pptx-build");
await fs.mkdir(buildDirectory, { recursive: true });
const candidatePath = path.join(buildDirectory, "candidate-legend.pptx");
const presentation = await createAnalyticsPptx(reports, candidatePath);
for (const [index, slide] of presentation.slides.items.entries()) {
  const image = await presentation.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(path.join(buildDirectory, `legend-slide-${index + 1}.png`), new Uint8Array(await image.arrayBuffer()));
}
console.log(await finalizeSample(candidatePath, "analytics-synthetic-sample.pptx"));
