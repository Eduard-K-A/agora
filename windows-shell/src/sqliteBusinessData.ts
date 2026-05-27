import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type {
  SaveCallSummaryRequest,
  SaveCallSummaryResponse,
  ScreenContextItem
} from "./types";

const execFileAsync = promisify(execFile);
const SQLITE_TIMEOUT_MS = 8000;

type InventoryContextRow = {
  sku: string;
  name: string;
  category: string;
  unit_price_cents: number;
  reorder_point: number;
  target_stock: number;
  total_available: number;
  location_breakdown: string;
  quantity_inbound: number | null;
  next_expected_at: string | null;
};

type SavedSummaryRow = {
  id: number;
  created_at: string;
};

const SEARCH_STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "buy",
  "can",
  "customer",
  "for",
  "from",
  "get",
  "has",
  "have",
  "how",
  "item",
  "items",
  "many",
  "need",
  "order",
  "piece",
  "pieces",
  "please",
  "stock",
  "that",
  "the",
  "they",
  "this",
  "want",
  "wants",
  "with",
  "would"
]);

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function sqliteQuote(value: unknown): string {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function normalizeSearchTerm(term: string): string {
  return term.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export function extractInventorySearchTerms(text: string): string[] {
  const terms = text
    .split(/\s+/)
    .map(normalizeSearchTerm)
    .filter((term) => term.length >= 3 && !SEARCH_STOP_WORDS.has(term));

  const singularTerms = terms
    .filter((term) => term.endsWith("s") && term.length > 4)
    .map((term) => term.slice(0, -1));

  return unique([...terms, ...singularTerms]).slice(0, 8);
}

export function resolveBusinessStockDatabasePath(): string {
  const candidates = [
    path.resolve(process.cwd(), "mock-data/business-stock.sqlite"),
    path.resolve(process.cwd(), "../mock-data/business-stock.sqlite"),
    path.resolve(__dirname, "../../../mock-data/business-stock.sqlite"),
    path.resolve(__dirname, "../../../../mock-data/business-stock.sqlite"),
    path.resolve(__dirname, "../../mock-data/business-stock.sqlite")
  ];

  const databasePath = candidates.find((candidate) => fs.existsSync(candidate));

  if (!databasePath) {
    throw new Error("Mock business stock SQLite database was not found.");
  }

  return databasePath;
}

async function runSqlite(databasePath: string, sql: string, jsonOutput = false): Promise<string> {
  const args = jsonOutput ? ["-json", databasePath, sql] : [databasePath, sql];
  const { stdout } = await execFileAsync("sqlite3", args, {
    maxBuffer: 1024 * 1024,
    timeout: SQLITE_TIMEOUT_MS,
    windowsHide: true
  });

  return stdout.trim();
}

async function queryJson<T>(databasePath: string, sql: string): Promise<T[]> {
  const output = await runSqlite(databasePath, sql, true);
  return output ? (JSON.parse(output) as T[]) : [];
}

function buildInventoryContextSql(text: string): string {
  const terms = extractInventorySearchTerms(text);
  const matchClause = terms.length > 0
    ? terms
        .map((term) => {
          const pattern = sqliteQuote(`%${term}%`);
          return [
            `LOWER(p.sku) LIKE ${pattern}`,
            `LOWER(p.name) LIKE ${pattern}`,
            `LOWER(p.category) LIKE ${pattern}`
          ].join(" OR ");
        })
        .map((clause) => `(${clause})`)
        .join(" OR ")
    : "1 = 1";

  return `
    WITH active_orders AS (
      SELECT
        product_id,
        SUM(quantity_ordered - quantity_received) AS quantity_inbound,
        MIN(expected_at) AS next_expected_at
      FROM purchase_orders
      WHERE status IN ('ordered', 'partially_received')
      GROUP BY product_id
    ),
    stock_rollup AS (
      SELECT
        p.sku,
        p.name,
        p.category,
        p.unit_price_cents,
        p.reorder_point,
        p.target_stock,
        COALESCE(SUM(s.quantity_available), 0) AS total_available,
        GROUP_CONCAT(l.name || ': ' || s.quantity_available, '; ') AS location_breakdown,
        COALESCE(o.quantity_inbound, 0) AS quantity_inbound,
        o.next_expected_at
      FROM products p
      LEFT JOIN inventory_stock s ON s.product_id = p.id
      LEFT JOIN locations l ON l.id = s.location_id
      LEFT JOIN active_orders o ON o.product_id = p.id
      WHERE p.is_active = 1 AND (${matchClause})
      GROUP BY p.id
    )
    SELECT *
    FROM stock_rollup
    ORDER BY
      CASE WHEN total_available < reorder_point THEN 0 ELSE 1 END,
      total_available ASC,
      sku ASC
    LIMIT 6;
  `;
}

function formatInventoryContext(row: InventoryContextRow): ScreenContextItem {
  const stockStatus =
    row.total_available <= 0
      ? "out of stock"
      : row.total_available < row.reorder_point
        ? "low stock"
        : "healthy stock";
  const inbound =
    row.quantity_inbound && row.quantity_inbound > 0
      ? ` Inbound: ${row.quantity_inbound} expected ${row.next_expected_at ?? "soon"}.`
      : "";

  return {
    label: `Inventory: ${row.sku} ${row.name}`,
    summary:
      `${row.name} has ${row.total_available} available across locations ` +
      `(${row.location_breakdown || "no location stock"}). ` +
      `Reorder point: ${row.reorder_point}; target stock: ${row.target_stock}; status: ${stockStatus}.` +
      inbound
  };
}

export async function getInventoryContextForText(text: string): Promise<ScreenContextItem[]> {
  const databasePath = resolveBusinessStockDatabasePath();
  const rows = await queryJson<InventoryContextRow>(databasePath, buildInventoryContextSql(text));
  return rows.map(formatInventoryContext);
}

async function ensureSummaryTables(databasePath: string): Promise<void> {
  await runSqlite(
    databasePath,
    `
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS call_summaries (
        id INTEGER PRIMARY KEY,
        business_id INTEGER NOT NULL REFERENCES businesses(id),
        summary TEXT NOT NULL,
        recommended_follow_up TEXT NOT NULL,
        rep_coaching TEXT NOT NULL,
        objections_json TEXT NOT NULL,
        buying_signals_json TEXT NOT NULL,
        scripts_used_json TEXT NOT NULL,
        transcript_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `
  );
}

export async function saveCallSummaryToSqlite(
  input: SaveCallSummaryRequest
): Promise<SaveCallSummaryResponse> {
  const databasePath = resolveBusinessStockDatabasePath();
  const createdAtISO = input.createdAtISO ?? new Date().toISOString();

  await ensureSummaryTables(databasePath);

  const rows = await queryJson<SavedSummaryRow>(
    databasePath,
    `
      INSERT INTO call_summaries (
        business_id,
        summary,
        recommended_follow_up,
        rep_coaching,
        objections_json,
        buying_signals_json,
        scripts_used_json,
        transcript_json,
        created_at
      ) VALUES (
        1,
        ${sqliteQuote(input.summary.summary)},
        ${sqliteQuote(input.summary.recommendedFollowUp)},
        ${sqliteQuote(input.summary.repCoaching)},
        ${sqliteQuote(JSON.stringify(input.summary.objections))},
        ${sqliteQuote(JSON.stringify(input.summary.buyingSignals))},
        ${sqliteQuote(JSON.stringify(input.summary.scriptsUsed))},
        ${sqliteQuote(JSON.stringify(input.transcript))},
        ${sqliteQuote(createdAtISO)}
      );
      SELECT last_insert_rowid() AS id, ${sqliteQuote(createdAtISO)} AS created_at;
    `
  );
  const saved = rows[0];

  if (!saved) {
    throw new Error("SQLite did not return a saved summary id.");
  }

  return {
    id: saved.id,
    createdAtISO: saved.created_at,
    databasePath
  };
}
