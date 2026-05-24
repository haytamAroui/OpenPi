import * as fs from "node:fs";
import * as path from "node:path";

export type AuditLogEntry = {
  timestamp: string;
  type: "workflow" | "team_agent" | "chain_step" | "chain_run";
  name: string;
  task: string;
  input: string;
  output: string;
  exitCode: number;
  elapsedMs: number;
  metadata?: Record<string, any>;
};

export function writeAuditLog(cwd: string, entry: Omit<AuditLogEntry, "timestamp">) {
  try {
    const logDir = path.join(cwd, ".pi", "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, "openpi-audit.jsonl");
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry
    });
    fs.appendFileSync(logFile, `${line}\n`, "utf-8");
  } catch {
    // Silent fail to ensure logger never disrupts runtime in case of file locks
  }
}
