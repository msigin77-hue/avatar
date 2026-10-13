import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const tool = process.env.AVATAR_ARTIFACT_TOOL || 'C:/Users/msigi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const { FileBlob, PresentationFile } = await import(pathToFileURL(tool).href);
const directory = path.resolve('docs/chat/period-analytics-scenario');
for (const [file, prefix] of [
  ['analytics-synthetic-sample.pptx', 'published-monthly'],
  ['analytics-weekly-synthetic-sample.pptx', 'published-weekly'],
]) {
  const presentation = await PresentationFile.importPptx(await FileBlob.load(path.join(directory, 'examples', file)));
  if (presentation.slides.items.length !== 2) throw new Error(`${file}: expected two slides`);
  for (const [index, slide] of presentation.slides.items.entries()) {
    const png = await presentation.export({ slide, format: 'png', scale: 1 });
    await fs.writeFile(path.join(directory, '.pptx-build', `${prefix}-${index + 1}.png`), new Uint8Array(await png.arrayBuffer()));
  }
  console.log(`${file}: imported and rendered ${presentation.slides.items.length} slides`);
}
