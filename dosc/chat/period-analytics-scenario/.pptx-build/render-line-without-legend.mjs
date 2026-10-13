import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateReports } from '../report-data.mjs';
import { createAnalyticsPptx } from '../pptx-generator.mjs';

const directory = path.dirname(fileURLToPath(import.meta.url));
const reports = generateReports({ product: 'ОМС', detail: 'month', splitTopics: 'all', chartType: 'line' }, new Date(2026, 9, 9, 12));
reports[1].chartType = 'histogram';
const presentation = await createAnalyticsPptx(reports, path.join(directory, 'axis-labels.pptx'));
for (const [index, slide] of presentation.slides.items.entries()) {
  const png = await presentation.export({ slide, format: 'png', scale: 1 });
  await fs.writeFile(path.join(directory, `axis-labels-${index + 1}.png`), new Uint8Array(await png.arrayBuffer()));
}
console.log('Rendered a line chart with value labels and a stacked column chart.');
