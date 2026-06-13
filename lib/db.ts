import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";
// @ts-ignore - bun:sqlite is a Bun built-in, available at runtime in OpenCode's Bun process
import { Database } from "bun:sqlite";

export interface TokenRecord {
  timestamp: number;
  sessionID: string;
  providerID: string;
  modelID: string;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: { read: number; write: number };
  };
  cost: number;
}

export interface PeriodStats {
  totalTokens: number;
  totalCost: number;
  totalSessions: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheRead: number;
  cacheWrite: number;
  startTime: number;
  endTime: number;
}

export interface ProviderStats {
  providerID: string;
  totalTokens: number;
  totalCost: number;
  sessionCount: number;
}

export interface ModelStats {
  modelID: string;
  providerID: string;
  totalTokens: number;
  totalCost: number;
  sessionCount: number;
}

export interface DailyUsage {
  date: string;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  cost: number;
}

export type Period = "24h" | "7d" | "30d" | "1y";

export function getPeriodRange(period: Period): { since: number; now: number } {
  const now = Date.now();
  const ms = {
    "24h": 86_400_000,
    "7d": 604_800_000,
    "30d": 2_592_000_000,
    "1y": 31_536_000_000,
  };
  return { since: now - ms[period], now };
}

export class TokenDB {
  private db: any;

  constructor(dbPath: string) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.db = new Database(dbPath);
    this.db.run("PRAGMA journal_mode = WAL");
    this.db.run("PRAGMA synchronous = NORMAL");
    this.init();
  }

  private init(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        session_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        tokens_input INTEGER DEFAULT 0,
        tokens_output INTEGER DEFAULT 0,
        tokens_reasoning INTEGER DEFAULT 0,
        cache_read INTEGER DEFAULT 0,
        cache_write INTEGER DEFAULT 0,
        cost REAL DEFAULT 0
      )
    `);
    this.db.run("CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage(timestamp)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage(provider_id)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_usage_model ON usage(model_id)");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_usage_session ON usage(session_id)");
  }

  insert(record: TokenRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO usage (timestamp, session_id, provider_id, model_id,
        tokens_input, tokens_output, tokens_reasoning,
        cache_read, cache_write, cost)
      VALUES ($timestamp, $session_id, $provider_id, $model_id,
        $tokens_input, $tokens_output, $tokens_reasoning,
        $cache_read, $cache_write, $cost)
    `);
    stmt.run({
      $timestamp: record.timestamp,
      $session_id: record.sessionID,
      $provider_id: record.providerID,
      $model_id: record.modelID,
      $tokens_input: record.tokens.input,
      $tokens_output: record.tokens.output,
      $tokens_reasoning: record.tokens.reasoning,
      $cache_read: record.tokens.cache.read,
      $cache_write: record.tokens.cache.write,
      $cost: record.cost,
    });
  }

  getStats(period: Period): PeriodStats {
    const { since, now } = getPeriodRange(period);
    const row = this.db.prepare(`
      SELECT
        COALESCE(SUM(tokens_input + tokens_output + tokens_reasoning + cache_read + cache_write), 0) as total_tokens,
        COALESCE(SUM(tokens_input), 0) as input_tokens,
        COALESCE(SUM(tokens_output), 0) as output_tokens,
        COALESCE(SUM(tokens_reasoning), 0) as reasoning_tokens,
        COALESCE(SUM(cache_read), 0) as cache_read_sum,
        COALESCE(SUM(cache_write), 0) as cache_write_sum,
        COALESCE(SUM(cost), 0) as total_cost,
        COUNT(DISTINCT session_id) as total_sessions
      FROM usage
      WHERE timestamp >= $since AND timestamp <= $now
    `).get({ $since: since, $now: now }) as any;

    return {
      totalTokens: row.total_tokens,
      totalCost: row.total_cost,
      totalSessions: row.total_sessions,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      reasoningTokens: row.reasoning_tokens,
      cacheRead: row.cache_read_sum,
      cacheWrite: row.cache_write_sum,
      startTime: since,
      endTime: now,
    };
  }

  getProviderStats(period: Period): ProviderStats[] {
    const { since, now } = getPeriodRange(period);
    return this.db.prepare(`
      SELECT
        provider_id,
        COALESCE(SUM(tokens_input + tokens_output + tokens_reasoning + cache_read + cache_write), 0) as total_tokens,
        COALESCE(SUM(cost), 0) as total_cost,
        COUNT(DISTINCT session_id) as session_count
      FROM usage
      WHERE timestamp >= $since AND timestamp <= $now
      GROUP BY provider_id
      ORDER BY total_cost DESC
    `).all({ $since: since, $now: now }) as ProviderStats[];
  }

  getModelStats(period: Period): ModelStats[] {
    const { since, now } = getPeriodRange(period);
    return this.db.prepare(`
      SELECT
        model_id,
        provider_id,
        COALESCE(SUM(tokens_input + tokens_output + tokens_reasoning + cache_read + cache_write), 0) as total_tokens,
        COALESCE(SUM(cost), 0) as total_cost,
        COUNT(DISTINCT session_id) as session_count
      FROM usage
      WHERE timestamp >= $since AND timestamp <= $now
      GROUP BY model_id
      ORDER BY total_cost DESC
    `).all({ $since: since, $now: now }) as ModelStats[];
  }

  getDailyUsage(period: Period): DailyUsage[] {
    const { since, now } = getPeriodRange(period);
    return this.db.prepare(`
      SELECT
        DATE(timestamp / 1000, 'unixepoch') as date,
        MIN(timestamp) as ts,
        COALESCE(SUM(tokens_input), 0) as input_tokens,
        COALESCE(SUM(tokens_output), 0) as output_tokens,
        COALESCE(SUM(tokens_reasoning), 0) as reasoning_tokens,
        COALESCE(SUM(tokens_input + tokens_output + tokens_reasoning + cache_read + cache_write), 0) as total_tokens,
        COALESCE(SUM(cost), 0) as cost
      FROM usage
      WHERE timestamp >= $since AND timestamp <= $now
      GROUP BY DATE(timestamp / 1000, 'unixepoch')
      ORDER BY date ASC
    `).all({ $since: since, $now: now }).map((r: any) => ({
      date: r.date,
      timestamp: r.ts,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      reasoningTokens: r.reasoning_tokens,
      totalTokens: r.total_tokens,
      cost: r.cost,
    }));
  }

  getRawRecords(period: Period, limit: number = 500): TokenRecord[] {
    const { since, now } = getPeriodRange(period);
    return this.db.prepare(`
      SELECT timestamp, session_id, provider_id, model_id,
        tokens_input, tokens_output, tokens_reasoning,
        cache_read, cache_write, cost
      FROM usage
      WHERE timestamp >= $since AND timestamp <= $now
      ORDER BY timestamp DESC
      LIMIT $limit
    `).all({ $since: since, $now: now, $limit: limit }).map((r: any) => ({
      timestamp: r.timestamp,
      sessionID: r.session_id,
      providerID: r.provider_id,
      modelID: r.model_id,
      tokens: {
        input: r.tokens_input,
        output: r.tokens_output,
        reasoning: r.tokens_reasoning,
        cache: { read: r.cache_read, write: r.cache_write },
      },
      cost: r.cost,
    }));
  }

  getAllRawRecords(period: Period): TokenRecord[] {
    const { since, now } = getPeriodRange(period);
    return this.db.prepare(`
      SELECT timestamp, session_id, provider_id, model_id,
        tokens_input, tokens_output, tokens_reasoning,
        cache_read, cache_write, cost
      FROM usage
      WHERE timestamp >= $since AND timestamp <= $now
      ORDER BY timestamp ASC
    `).all({ $since: since, $now: now }).map((r: any) => ({
      timestamp: r.timestamp,
      sessionID: r.session_id,
      providerID: r.provider_id,
      modelID: r.model_id,
      tokens: {
        input: r.tokens_input,
        output: r.tokens_output,
        reasoning: r.tokens_reasoning,
        cache: { read: r.cache_read, write: r.cache_write },
      },
      cost: r.cost,
    }));
  }

  getDailyProviderCost(period: Period): { date: string; provider_id: string; cost: number }[] {
    const { since, now } = getPeriodRange(period);
    return this.db.prepare(`
      SELECT DATE(timestamp / 1000, 'unixepoch') as date, provider_id, SUM(cost) as cost
      FROM usage
      WHERE timestamp >= $since AND timestamp <= $now
      GROUP BY DATE(timestamp / 1000, 'unixepoch'), provider_id
      ORDER BY date ASC, provider_id ASC
    `).all({ $since: since, $now: now }) as { date: string; provider_id: string; cost: number }[];
  }

  close(): void {
    this.db.close();
  }
}
