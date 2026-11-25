// Helpers for the batch scripts: read and write the remote D1 with wrangler, read keys
// from the environment or .dev.vars, and call OpenRouter.
// wrangler needs a Node built for this machine's processor (on Apple Silicon, an arm64 Node).
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// wrangler reads the database settings from the repo, so run it there from any folder.
export const repo = fileURLToPath(new URL("../..", import.meta.url));

export function readKey(name) {
  if (process.env[name]) return process.env[name];
  const file = path.join(repo, ".dev.vars");
  if (!existsSync(file)) return "";
  const line = readFileSync(file, "utf8").split("\n").find((row) => row.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "") : "";
}

function wrangler(args, { parse = true } = {}) {
  const output = execFileSync("npx", ["wrangler", "d1", "execute", "record-club", "--remote", "--json", ...args], {
    cwd: repo,
    encoding: "utf8",
    env: { ...process.env, WRANGLER_WRITE_LOGS: "false" },
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  });
  // With --file, wrangler prints upload progress before its JSON, so only queries are parsed.
  return parse ? JSON.parse(output) : output;
}

// One SELECT; returns its rows.
export function d1Query(sql) {
  return wrangler(["--command", sql])[0].results || [];
}

// Many write statements, sent as one file in slices so no single upload is too large.
export function d1Write(statements, { slice = 200 } = {}) {
  for (let start = 0; start < statements.length; start += slice) {
    const folder = mkdtempSync(path.join(tmpdir(), "record-club-"));
    const file = path.join(folder, "batch.sql");
    writeFileSync(file, `${statements.slice(start, start + slice).join(";\n")};\n`);
    try {
      // D1 runs one file import at a time, so a busy database is tried again a few times.
      for (let attempt = 1; ; attempt += 1) {
        try {
          wrangler(["--file", file], { parse: false });
          break;
        } catch (error) {
          if (attempt >= 6) throw error;
          execFileSync("sleep", [String(10 * attempt)]);
        }
      }
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }
}

export const sqlText = (value) => (value === null || value === undefined ? "NULL" : `'${String(value).replaceAll("'", "''")}'`);
export const sqlNumber = (value) => (Number.isFinite(Number(value)) ? String(Number(value)) : "NULL");
export const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

// One OpenRouter chat call that must return a JSON object. Temperature 0, no reasoning,
// and a retry when the reply is cut off, empty or not JSON. Returns { data, cost, raw }.
export async function openRouterJson({ model, messages, maxTokens = 900, tries = 3 }) {
  const key = readKey("OPENROUTER_API_KEY");
  if (!key) throw new Error("OPENROUTER_API_KEY is not set.");
  let lastError = null;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          reasoning: { enabled: false },
          usage: { include: true },
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(`OpenRouter ${response.status}: ${JSON.stringify(body?.error || body).slice(0, 300)}`);
      const choice = body?.choices?.[0];
      const text = String(choice?.message?.content || "").trim();
      if (choice?.finish_reason && choice.finish_reason !== "stop") throw new Error(`finish_reason ${choice.finish_reason}`);
      const json = text.replace(/^```(?:json)?\s*|\s*```$/g, "");
      return { data: JSON.parse(json), cost: Number(body?.usage?.cost || 0), raw: body, model: body?.model || model };
    } catch (error) {
      lastError = error;
      await wait(1500 * attempt);
    }
  }
  throw lastError;
}

// Run fn over items with at most `limit` running at once.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
