import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAnalyticsPptx } from "./pptx-generator.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const currentDialog = path.resolve(directory, "..", "current-dialog-mockup.html");
const assets = new Map([
  ["/", [path.join(directory, "index.html"), "text/html"]],
  ["/index.html", [path.join(directory, "index.html"), "text/html"]],
  ["/styles.css", [path.join(directory, "styles.css"), "text/css"]],
  ["/prototype.css", [path.join(directory, "prototype.css"), "text/css"]],
  ["/workbench.css", [path.join(directory, "workbench.css"), "text/css"]],
  ["/app.js", [path.join(directory, "app.js"), "text/javascript"]],
  ["/workbench.js", [path.join(directory, "workbench.js"), "text/javascript"]],
  ["/workbench-model.mjs", [path.join(directory, "workbench-model.mjs"), "text/javascript"]],
  ["/screen-data.mjs", [path.join(directory, "screen-data.mjs"), "text/javascript"]],
  ["/messages.mjs", [path.join(directory, "messages.mjs"), "text/javascript"]],
  ["/scenario-state.mjs", [path.join(directory, "scenario-state.mjs"), "text/javascript"]],
  ["/report-data.mjs", [path.join(directory, "report-data.mjs"), "text/javascript"]],
  ["/current-dialog-mockup.html", [currentDialog, "text/html"]],
  ["/examples/analytics-synthetic-sample.pptx", [path.join(directory, "examples", "analytics-synthetic-sample.pptx"), "application/vnd.openxmlformats-officedocument.presentationml.presentation"]],
  ["/examples/analytics-weekly-synthetic-sample.pptx", [path.join(directory, "examples", "analytics-weekly-synthetic-sample.pptx"), "application/vnd.openxmlformats-officedocument.presentationml.presentation"]],
]);
const maxBodyBytes = 1_500_000;

async function sendFile(request, response, filename, contentType) {
  const content = await fs.readFile(filename);
  const charset = contentType.startsWith("text/") ? "; charset=utf-8" : "";
  response.writeHead(200, { "Content-Type": `${contentType}${charset}`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  if (request.method === "HEAD") response.end();
  else response.end(content);
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/presentation") {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > maxBodyBytes) {
          response.writeHead(413);
          response.end("Слишком большой запрос.");
          return;
        }
        chunks.push(chunk);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!Array.isArray(payload.reports) || payload.reports.length !== 2) {
        response.writeHead(400);
        response.end("Ожидались данные двух слайдов.");
        return;
      }
      const outputPath = path.join(os.tmpdir(), `avatar-analytics-${process.pid}-${Date.now()}.pptx`);
      try {
        await createAnalyticsPptx(payload.reports, outputPath);
        const content = await fs.readFile(outputPath);
        response.writeHead(200, {
          "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": "attachment; filename=analytics-synthetic.pptx",
          "Content-Length": content.length,
          "Cache-Control": "no-store",
        });
        response.end(content);
      } finally {
        await fs.rm(outputPath, { force: true });
        await fs.rm(`${outputPath}.inspect.ndjson`, { force: true });
      }
      return;
    }

    if (!request.url || !["GET", "HEAD"].includes(request.method)) {
      response.writeHead(404);
      response.end();
      return;
    }
    const key = new URL(request.url, "http://127.0.0.1").pathname;
    const asset = assets.get(key);
    if (!asset) {
      response.writeHead(404);
      response.end();
      return;
    }
    await sendFile(request, response, asset[0], asset[1]);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    response.end(`Не удалось сформировать локальный файл: ${error.message}`);
  }
});

const port = Number(process.env.PERIOD_ANALYTICS_PORT || 28766);
server.listen(port, "127.0.0.1", () => console.log(`Period analytics scenario: http://127.0.0.1:${server.address().port}`));
server.on("error", error => { console.error(error.message); process.exitCode = 1; });
