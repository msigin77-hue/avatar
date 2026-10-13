import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { axisTicks, lineValueLabels, pieColors, pieLegendLayout, pieLegendRows, summaryLayout } from "./pptx-layout.mjs";

const packageEntry = process.env.AVATAR_ARTIFACT_TOOL || path.join(
  os.homedir(),
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "node",
  "node_modules",
  "@oai",
  "artifact-tool",
  "dist",
  "artifact_tool.mjs",
);
const { Presentation, PresentationFile } = await import(pathToFileURL(packageEntry).href);

const W = 1280;
const H = 720;
const colors = pieColors;
const subtopicCatalog = {
  gold: {
    toxic: [
      { text: "Отсутствие информации о наличии золотых слитков в московском отделении", topicIndex: 0, ratio: 0.31, measure: "Анализ наличия слитков в ВСП" },
      { text: "Отсутствие золотых слитков в отделении", topicIndex: 1, ratio: 0.28, measure: "Анализ обращений" },
      { text: "Сложности с покупкой золотых слитков через ОМС", topicIndex: 2, ratio: 0.22, measure: "Анализ ценообразования" },
      { text: "Неясные условия резервирования золотых слитков", topicIndex: 3, ratio: 0.18, measure: "Загрузка информации в Гигапоиск СБОЛ по тематике" },
    ],
    consultation: [
      { text: "Где узнать о наличии золотых слитков в московском отделении", topicIndex: 0, ratio: 0.29, measure: "Загрузка информации в Гигапоиск СБОЛ по тематике" },
      { text: "Как купить золотые слитки в отделении", topicIndex: 1, ratio: 0.25, measure: "Анализ наличия слитков в ВСП" },
      { text: "Как рассчитывается стоимость покупки золотых слитков", topicIndex: 2, ratio: 0.21, measure: "Анализ ценообразования" },
      { text: "Как зарезервировать золотые слитки", topicIndex: 3, ratio: 0.17, measure: "Анализ обращений" },
    ],
  },
  exchange: {
    toxic: [
      { text: "Наличие в Москве офиса для покупки валюты CNY", topicIndex: 0, ratio: 0.30, measure: "Загрузка информации в Гигапоиск СБОЛ по тематике" },
      { text: "Обмен цветных валют BYN в Москве", topicIndex: 1, ratio: 0.27, measure: "Анализ обращений" },
      { text: "Проблемы со спредом при обмене долларов", topicIndex: 2, ratio: 0.24, measure: "Анализ ценообразования" },
      { text: "Недостаточно информации об условиях обмена валют", topicIndex: 3, ratio: 0.18, measure: "Загрузка информации в Гигапоиск СБОЛ по тематике" },
    ],
    consultation: [
      { text: "Как найти офис для покупки валюты CNY в Москве", topicIndex: 0, ratio: 0.29, measure: "Загрузка информации в Гигапоиск СБОЛ по тематике" },
      { text: "Какие цветные валюты BYN можно обменять в Москве", topicIndex: 1, ratio: 0.25, measure: "Анализ обращений" },
      { text: "Как рассчитывается спред при обмене долларов", topicIndex: 2, ratio: 0.23, measure: "Анализ ценообразования" },
      { text: "Какие документы нужны для обмена валют", topicIndex: 3, ratio: 0.18, measure: "Загрузка информации в Гигапоиск СБОЛ по тематике" },
    ],
  },
  card: {
    toxic: [
      { text: "Оплата картой не проходит в торговой точке", topicIndex: 0, ratio: 0.31, measure: "Анализ обращений" },
      { text: "В истории карты не отображается операция", topicIndex: 1, ratio: 0.27, measure: "Анализ обращений" },
      { text: "Непонятные условия конверсии при оплате картой", topicIndex: 2, ratio: 0.23, measure: "Анализ ценообразования" },
      { text: "Списание по карте отображается с задержкой", topicIndex: 3, ratio: 0.19, measure: "Анализ обращений" },
    ],
    consultation: [
      { text: "Как проверить статус карточной операции", topicIndex: 0, ratio: 0.29, measure: "Загрузка информации в Гигапоиск СБОЛ по тематике" },
      { text: "Когда операция появится в истории карты", topicIndex: 1, ratio: 0.25, measure: "Загрузка информации в Гигапоиск СБОЛ по тематике" },
      { text: "Как работает конверсия при оплате картой", topicIndex: 2, ratio: 0.22, measure: "Анализ ценообразования" },
      { text: "Как оспорить списание по карте", topicIndex: 3, ratio: 0.18, measure: "Анализ обращений" },
    ],
  },
  transfers: {
    toxic: [
      { text: "Перевод отклонён при указании цели операции", topicIndex: 0, ratio: 0.30, measure: "Анализ обращений" },
      { text: "Не отображается выбранная цель перевода", topicIndex: 1, ratio: 0.27, measure: "Загрузка информации в Гигапоиск СБОЛ по тематике" },
      { text: "Срок зачисления перевода превышает ожидаемый", topicIndex: 2, ratio: 0.23, measure: "Анализ обращений" },
      { text: "Неясны требования к назначению перевода", topicIndex: 3, ratio: 0.19, measure: "Загрузка информации в Гигапоиск СБОЛ по тематике" },
    ],
    consultation: [
      { text: "Как выбрать цель перевода", topicIndex: 0, ratio: 0.29, measure: "Загрузка информации в Гигапоиск СБОЛ по тематике" },
      { text: "Какие цели доступны для перевода", topicIndex: 1, ratio: 0.25, measure: "Загрузка информации в Гигапоиск СБОЛ по тематике" },
      { text: "Когда поступит перевод получателю", topicIndex: 2, ratio: 0.22, measure: "Анализ обращений" },
      { text: "Как подтвердить назначение перевода", topicIndex: 3, ratio: 0.18, measure: "Анализ обращений" },
    ],
  },
};
const productSubtopicGroups = {
  "ОМС": "gold",
  "СЛИТКИ": "gold",
  "Конверсия в СБОЛе": "exchange",
  "Конверсия в ВСП": "exchange",
  "Карточная конверсия": "card",
  "Переводы(в целях)": "transfers",
};

function addText(slide, text, position, style = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position,
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
    text: { text: String(text), style: { typeface: "Arial", fontSize: 18, color: "#263746", ...style } },
  });
  shape.text.insets = 0;
  return shape;
}

function addRect(slide, position, fill) {
  return slide.shapes.add({
    geometry: "rect",
    position,
    fill,
    line: { style: "solid", fill, width: 0 },
  });
}

function addYAxis(slide, left, top, baseline, ticks) {
  const labelLeft = left - 54;
  const plotHeight = baseline - top;
  ticks.forEach((value, index) => {
    const ratio = index / (ticks.length - 1);
    const y = baseline - plotHeight * ratio;
    addText(slide, value.toLocaleString("ru-RU"), { left: labelLeft, top: y - 8, width: 44, height: 16 }, {
      fontSize: 11,
      alignment: "right",
      verticalAlignment: "middle",
      color: "#687A88",
    });
    if (index > 0) addRect(slide, { left, top: y, width: 1100, height: 1 }, "#E2E8ED");
  });
}

function addPie(slide, report) {
  const total = report.pie.reduce((sum, value) => sum + value, 0);
  const centerX = 410;
  const centerY = 244;
  const radius = 108;
  let angle = -90;
  report.pie.forEach((value, index) => {
    const sweep = value / total * 360;
    const steps = Math.max(3, Math.ceil(sweep / 5));
    const commands = [{ moveTo: { x: radius, y: radius } }];
    for (let step = 0; step <= steps; step++) {
      const radians = (angle + sweep * step / steps) * Math.PI / 180;
      commands.push({ lineTo: { x: radius + radius * Math.cos(radians), y: radius + radius * Math.sin(radians) } });
    }
    commands.push({ close: {} });
    slide.shapes.add({
      geometry: "custom",
      position: { left: centerX - radius, top: centerY - radius, width: radius * 2, height: radius * 2 },
      customPaths: [{ width: radius * 2, height: radius * 2, commands }],
      fill: colors[index],
      line: { style: "solid", fill: "#FFFFFF", width: 1.2 },
    });
    const middle = (angle + sweep / 2) * Math.PI / 180;
    const labelRadius = radius * 0.63;
    const percentage = Math.round(value / total * 100);
    addText(slide, `${percentage}%`, {
      left: centerX + labelRadius * Math.cos(middle) - 27,
      top: centerY + labelRadius * Math.sin(middle) - 11,
      width: 54,
      height: 22,
    }, { fontSize: 16, bold: true, alignment: "center", verticalAlignment: "middle", color: index < 2 ? "#FFFFFF" : "#1F3344" });
    angle += sweep;
  });
}

function addPieLegend(slide, report) {
  addText(slide, "ТЕМАТИКИ", pieLegendLayout.heading, { fontSize: 13, bold: true, color: "#344B60" });
  pieLegendRows(report).forEach(({ topic, count, share, color }, index) => {
    const top = pieLegendLayout.rowTop + index * pieLegendLayout.rowGap;
    addRect(slide, { left: pieLegendLayout.markerX, top: top + 2, width: 12, height: 12 }, color);
    addText(slide, topic, { left: pieLegendLayout.topicX, top, width: 144, height: 19 }, { fontSize: 12, color: "#2D4153" });
    addText(slide, `${count.toLocaleString("ru-RU")} · ${share}%`, { left: pieLegendLayout.metricX, top, width: 80, height: 19 }, { fontSize: 12, alignment: "right", color: "#52616E" });
  });
}

function addTopSubtopics(slide, report) {
  const total = report.pie.reduce((sum, value) => sum + value, 0);
  const group = productSubtopicGroups[report.product] || "exchange";
  const subtopics = subtopicCatalog[group][report.kind] || subtopicCatalog.exchange[report.kind];
  const rankedSubtopics = subtopics
    .map(subtopic => ({ ...subtopic, count: Math.round((report.pie[subtopic.topicIndex] || 0) * subtopic.ratio) }))
    .sort((left, right) => right.count - left.count);
  addText(slide, `Всего за ${report.monthName} ${report.year}: ${total.toLocaleString("ru-RU")} обращений`, summaryLayout.total, { fontSize: 19, bold: true, color: "#1B4F72" });
  addText(slide, "ТОП-3 ПОДТЕМАТИК · ПО ЧИСЛУ ОБРАЩЕНИЙ", summaryLayout.top3Heading, { fontSize: 14, bold: true, color: "#344B60" });
  rankedSubtopics.slice(0, 3).forEach(({ text, count, measure }, index) => {
    const share = Math.round(count / total * 100);
    const top = 190 + index * 70;
    const color = colors[index];
    addRect(slide, { left: 818, top: top + 1, width: 22, height: 22 }, color);
    addText(slide, index + 1, { left: 818, top: top + 1, width: 22, height: 22 }, { fontSize: 12, bold: true, alignment: "center", verticalAlignment: "middle", color: "#FFFFFF" });
    addText(slide, text, { left: 849, top, width: 356, height: 34 }, { fontSize: 14, bold: true, color: "#2D4153" });
    addText(slide, `${count.toLocaleString("ru-RU")} обращений · ${share}%`, { left: 849, top: top + 34, width: 356, height: 16 }, { fontSize: 12, color: "#687A88" });
    addText(slide, `Мера: ${measure}`, { left: 849, top: top + 50, width: 356, height: 18 }, { fontSize: 11, color: "#687A88" });
  });
}

function addStackedBars(slide, report) {
  const left = 110;
  const right = 1210;
  const plotWidth = right - left;
  const baseline = 625;
  const top = 470;
  const maxHeight = baseline - top;
  const maxTotal = Math.max(...report.totals);
  const ticks = axisTicks(maxTotal);
  const axisMaximum = ticks.at(-1);
  const slot = plotWidth / report.periods.length;
  const barWidth = Math.max(8, Math.min(44, slot * 0.7));
  const dateFont = report.periods.length > 16 ? 9 : 12;
  const countFont = report.periods.length > 16 ? 9 : 11;

  addText(slide, `Количество обращений · ${report.range}`, { left, top: 408, width: plotWidth, height: 34 }, { fontSize: 22, bold: true, color: "#2D4153" });
  addYAxis(slide, left, top, baseline, ticks);
  addRect(slide, { left, top: baseline, width: plotWidth, height: 1 }, "#82919D");

  report.periods.forEach((period, periodIndex) => {
    const total = report.totals[periodIndex];
    const totalHeight = Math.max(30, maxHeight * total / axisMaximum);
    const x = left + periodIndex * slot + (slot - barWidth) / 2;
    let y = baseline;
    report.series.forEach((series, topicIndex) => {
      const value = series.values[periodIndex] || 0;
      const segmentHeight = total > 0 ? totalHeight * value / total : 0;
      y -= segmentHeight;
      addRect(slide, { left: x, top: y, width: barWidth, height: segmentHeight }, colors[topicIndex]);
      addText(slide, value, { left: x - 1, top: y + Math.max(0, (segmentHeight - 15) / 2), width: barWidth + 2, height: 15 }, {
        fontSize: countFont,
        bold: true,
        alignment: "center",
        verticalAlignment: "middle",
        color: topicIndex < 2 ? "#FFFFFF" : "#1E3140",
      });
    });
    addText(slide, total.toLocaleString("ru-RU"), { left: x - slot * 0.25, top: y - 19, width: barWidth + slot * 0.5, height: 17 }, {
      fontSize: countFont,
      bold: true,
      alignment: "center",
      color: "#263746",
    });
    if (report.periods.length <= 16 || periodIndex % 2 === 0 || periodIndex === report.periods.length - 1) {
      addText(slide, period, { left: left + periodIndex * slot - 2, top: baseline + 6, width: slot + 4, height: 30 }, {
        fontSize: dateFont,
        alignment: "center",
        color: "#52616E",
      });
    }
  });
}

function addLineChart(slide, report) {
  const left = 110;
  const plotWidth = 1100;
  const top = 456;
  const baseline = 625;
  const maxValue = Math.max(...report.series.flatMap(series => series.values), 1);
  const ticks = axisTicks(maxValue);
  const axisMaximum = ticks.at(-1);
  const slot = plotWidth / report.periods.length;
  const labelStride = report.periods.length > 16 ? Math.ceil(report.periods.length / 10) : 1;
  const valueLabels = new Map(lineValueLabels(report).map(({ index, value }) => [index, value]));
  addText(slide, `Динамика обращений · ${report.range}`, { left, top: 408, width: plotWidth, height: 34 }, { fontSize: 22, bold: true, color: "#2D4153" });
  addRect(slide, { left, top: baseline, width: plotWidth, height: 1 }, "#82919D");
  addYAxis(slide, left, top, baseline, ticks);
  report.series.forEach((series, seriesIndex) => {
    const commands = series.values.map((value, periodIndex) => ({
      [periodIndex === 0 ? "moveTo" : "lineTo"]: {
        x: periodIndex * slot + slot / 2,
        y: (baseline - top) * (1 - value / axisMaximum),
      },
    }));
    slide.shapes.add({
      geometry: "custom",
      position: { left, top, width: plotWidth, height: baseline - top },
      customPaths: [{ width: plotWidth, height: baseline - top, commands }],
      fill: "none",
      line: { style: "solid", fill: colors[seriesIndex % colors.length], width: 3 },
    });
    series.values.forEach((value, periodIndex) => {
      const markerSize = 7;
      const x = left + periodIndex * slot + slot / 2 - markerSize / 2;
      const y = baseline - (baseline - top) * value / axisMaximum - markerSize / 2;
      slide.shapes.add({
        geometry: "ellipse",
        position: { left: x, top: y, width: markerSize, height: markerSize },
        fill: colors[seriesIndex % colors.length],
        line: { style: "solid", fill: "#FFFFFF", width: 1 },
      });
      if (valueLabels.has(periodIndex)) {
        const labelWidth = report.periods.length > 16 ? 42 : 52;
        addText(slide, valueLabels.get(periodIndex).toLocaleString("ru-RU"), {
          left: x + markerSize / 2 - labelWidth / 2,
          top: y - 20,
          width: labelWidth,
          height: 16,
        }, {
          fontSize: report.periods.length > 16 ? 9 : 11,
          bold: true,
          alignment: "center",
          color: "#274B6D",
        });
      }
    });
  });
  report.periods.forEach((period, index) => {
    if (index % labelStride === 0 || index === report.periods.length - 1) {
      addText(slide, period, { left: left + index * slot - 2, top: baseline + 6, width: slot + 4, height: 30 }, { fontSize: report.periods.length > 16 ? 9 : 12, alignment: "center", color: "#52616E" });
    }
  });
}

function addReportSlide(presentation, report, index) {
  const slide = presentation.slides.add();
  slide.background.fill = "#FFFFFF";
  addText(slide, report.title, { left: 54, top: 28, width: 1170, height: 52 }, { fontSize: 39, bold: true, color: "#174A78" });
  addText(slide, `${report.product} · доли тематик за ${report.monthName} ${report.year}`, { left: 57, top: 81, width: 1140, height: 29 }, { fontSize: 20, color: "#687A88" });

  addText(slide, "Доли тематик за последний полный месяц", { left: 66, top: 113, width: 680, height: 27 }, { fontSize: 20, bold: true, color: "#344B60" });
  addPie(slide, report);
  addPieLegend(slide, report);
  addTopSubtopics(slide, report);
  if (report.chartType === "line") addLineChart(slide, report);
  else addStackedBars(slide, report);
  addText(slide, "Синтетические данные · макет аналитического отчёта", { left: 56, top: 687, width: 780, height: 18 }, { fontSize: 11, color: "#82919D" });
  addText(slide, `${index + 1} / 2`, { left: 1160, top: 685, width: 58, height: 18 }, { fontSize: 11, alignment: "right", color: "#82919D" });
  return slide;
}

export async function createAnalyticsPptx(reports, outputPath) {
  if (!Array.isArray(reports) || reports.length !== 2) throw new Error("В презентации должны быть ровно два слайда.");
  const presentation = Presentation.create({ slideSize: { width: W, height: H } });
  presentation.theme.defaultFont = "Arial";
  reports.forEach((report, index) => addReportSlide(presentation, report, index));
  const file = await PresentationFile.exportPptx(presentation);
  await file.save(outputPath);
  return presentation;
}
