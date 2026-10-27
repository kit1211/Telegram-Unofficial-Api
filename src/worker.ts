import { ensureTelegramDataLayout } from "./storage/sqlite";
import { startWorkers } from "./queue/worker";

ensureTelegramDataLayout();
const worker = startWorkers();

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

async function shutdown(signal: string) {
  console.log(`${signal} — closing worker…`);
  await worker.close(true);
  process.exit(0);
}
