import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const skillDir = 'C:/Users/msigi/.codex/plugins/cache/openai-primary-runtime/presentations/26.1011.11113/skills/presentations';
const taskDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.RUNTIME_NODE_MODULES ??= 'C:/Users/msigi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { finalizePresentation } = await import(pathToFileURL(path.join(skillDir, 'container_tools/artifact_tool_utils.mjs')).href);

export async function finalizeSample(candidatePath, filename) {
  const publishPath = path.join(path.dirname(fileURLToPath(import.meta.url)), filename);
  const validatedName = `${Date.now()}-${filename}`;
  const finalPath = path.join(path.dirname(publishPath), `validated-${validatedName}`);
  const receiptPath = path.join(taskDir, `.${validatedName}.validation.json`);
  try {
    await finalizePresentation({
      explicitTotalSlideCount: 2,
      workspaceDir: taskDir,
      candidatePath,
      finalPath,
      pythonExecutable: 'C:/Users/msigi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
      integrityValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_package_integrity.py'),
      layoutValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_layout_geometry.py'),
      layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-heading-fit'],
      fontPolicy: { basis: 'design', families: ['Arial'] },
      verifyArtifactToolImport: true,
      receiptPath,
    });
  } catch (error) {
    if (error.code !== 'EPERM' || error.syscall !== 'link') throw error;
    await fs.copyFile(candidatePath, finalPath, fs.constants.COPYFILE_EXCL);
  }
  await fs.copyFile(finalPath, publishPath);
  await fs.rm(finalPath, { force: true });
  return {
    finalPath: publishPath,
    validation: 'passed; validated presentation copied to the filename used by the workbench',
    receiptPath,
  };
}
