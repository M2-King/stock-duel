import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
// sql.js ships as a CommonJS module (dist/sql-wasm.js) with no bundled .d.ts,
// so this default import resolves to `any` — that is fine, we wrap it below.
import initSqlJs from 'sql.js';

/**
 * 数据库门面 — 现在基于 sql.js（纯 JS + WASM，无需本地编译）。
 *
 * 之前用 better-sqlite3 / node:sqlite，需要 native prebuild；在用户的 Node
 * 版本上编译很痛苦。sql.js 把整个 SQLite 编进 WASM，跑在任何 Node 上都行。
 *
 * sql.js 是「内存数据库」：所有数据在内存里，需要显式 export() 成字节再写盘。
 * 因此我们在每次写操作后调用 save() 把内存快照落到 data/stock.db。
 *
 * 对外暴露的接口与之前保持完全一致，消费方无需改动：
 *   - prepare(sql).run(...)/.get(...)/.all(...)
 *   - exec(sql)
 *   - pragma(...)
 *   - transaction(fn) → wrapped function（BEGIN/COMMIT 包装，确保原子性）
 */
export interface DbStmt {
  run(...params: any[]): { changes: number; lastInsertRowid: number };
  get(...params: any[]): any;
  all(...params: any[]): any[];
}
export interface DbBackend {
  exec(sql: string): void;
  prepare(sql: string): DbStmt;
  pragma(s: string): any;
  transaction<T extends (...args: any[]) => any>(fn: T): T;
  close(): void;
}

/**
 * 把 better-sqlite3 风格的可变参数归一化成 sql.js 的 bind 入参。
 *
 * 消费方几乎都用「位置参数」：stmt.run(a, b, c) → sql.js bind([a, b, c])。
 * 也兼容单个对象（命名参数）或单个数组的调用方式。
 */
function normalizeParams(params: any[]): any[] | Record<string, any> {
  if (
    params.length === 1 &&
    params[0] !== null &&
    typeof params[0] === 'object'
  ) {
    // 单个对象/数组：直接透传给 sql.js（数组=位置绑定，对象=命名绑定）
    return params[0];
  }
  return params;
}

function hasBindables(bind: any[] | Record<string, any>): boolean {
  return Array.isArray(bind) ? bind.length > 0 : Object.keys(bind).length > 0;
}

@Injectable()
export class DatabaseService implements OnModuleInit, DbBackend {
  private readonly logger = new Logger(DatabaseService.name);

  private rawDb!: any; // sql.js Database 实例
  private dbPath!: string;
  /** 事务嵌套深度：>0 时 save() 延迟到最外层 COMMIT，避免事务中途落盘。 */
  private txDepth = 0;

  /**
   * 向后兼容：以前 `db` 是内部 backend 门面。现在指向 this（本服务自身即实现了
   * DbBackend），这样任何 `service.db.prepare(...)` 的老用法也不会 break。
   */
  public db!: DbBackend;

  async onModuleInit() {
    this.dbPath = join(process.cwd(), 'data', 'stock.db');
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    // sql.js 需要异步初始化并加载 sql-wasm.wasm。
    // 用 require.resolve 定位包内 dist 目录，保证 wasm 在运行时能找到。
    const SQL = await initSqlJs({
      locateFile: (file: string) =>
        join(dirname(require.resolve('sql.js')), file),
    });

    const existed = existsSync(this.dbPath);
    if (existed) {
      const fileBuffer = readFileSync(this.dbPath);
      this.rawDb = new SQL.Database(fileBuffer);
    } else {
      this.rawDb = new SQL.Database();
    }

    try {
      this.rawDb.run('PRAGMA foreign_keys = ON');
    } catch {
      /* ignore */
    }

    this.db = this;

    this.bootstrap();
    this.save();

    this.logger.log(
      `[ok] sql.js backend at ${this.dbPath} (${existed ? 'loaded existing' : 'created fresh'})`,
    );
  }

  /** 把内存数据库快照写盘。事务进行中时跳过，等最外层提交再统一落盘。 */
  private save(): void {
    if (this.txDepth > 0) return;
    const data: Uint8Array = this.rawDb.export();
    writeFileSync(this.dbPath, Buffer.from(data));
  }

  private bootstrap() {
    // 建表语句与之前完全一致，未做任何改动。
    this.rawDb.run(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        avatar TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        balance INTEGER NOT NULL DEFAULT 100000000,
        total_matches INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        losses INTEGER NOT NULL DEFAULT 0,
        win_streak INTEGER NOT NULL DEFAULT 0,
        best_return REAL NOT NULL DEFAULT 0,
        total_pnl INTEGER NOT NULL DEFAULT 0,
        token TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS matches (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        player1_id TEXT,
        player2_id TEXT,
        p1_role TEXT,
        p2_role TEXT,
        p1_assets INTEGER NOT NULL DEFAULT 100000000,
        p2_assets INTEGER NOT NULL DEFAULT 100000000,
        winner_id TEXT,
        initial_price REAL,
        ticks_per_day INTEGER NOT NULL DEFAULT 240,
        current_day INTEGER NOT NULL DEFAULT 1,
        current_tick INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        finished_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        match_id TEXT,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        side TEXT NOT NULL,
        order_type TEXT NOT NULL,
        price REAL NOT NULL,
        quantity INTEGER NOT NULL,
        cash_delta INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS positions (
        id TEXT PRIMARY KEY,
        match_id TEXT,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        avg_cost REAL NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (user_id, match_id, symbol)
      );

      CREATE TABLE IF NOT EXISTS match_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        match_id TEXT NOT NULL,
        user_id TEXT,
        symbol TEXT,
        tick INTEGER NOT NULL,
        day INTEGER NOT NULL DEFAULT 1,
        time_label TEXT,
        price REAL,
        volume INTEGER,
        order_book TEXT,
        event_type TEXT NOT NULL,
        event_data TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_match_events_match ON match_events(match_id, tick);

      CREATE TABLE IF NOT EXISTS match_recordings (
        match_id TEXT PRIMARY KEY,
        recording_data TEXT NOT NULL,
        duration INTEGER NOT NULL DEFAULT 0,
        total_ticks INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dealer_state (
        match_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        cash INTEGER NOT NULL DEFAULT 50000000,
        energy INTEGER NOT NULL DEFAULT 100,
        risk_index REAL NOT NULL DEFAULT 0,
        position_symbol TEXT,
        position_qty INTEGER NOT NULL DEFAULT 0,
        position_avg REAL NOT NULL DEFAULT 0,
        freeze_until_tick INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (match_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS user_match_state (
        match_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        cash INTEGER NOT NULL DEFAULT 100000000,
        borrowed INTEGER NOT NULL DEFAULT 0,
        leverage INTEGER NOT NULL DEFAULT 2,
        total_trade_count INTEGER NOT NULL DEFAULT 0,
        best_trade_pnl INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (match_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        match_id TEXT,
        from_user TEXT NOT NULL,
        from_role TEXT NOT NULL,
        to_user TEXT,
        subject TEXT NOT NULL,
        preview TEXT NOT NULL,
        content TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        type TEXT NOT NULL DEFAULT 'player',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY,
        match_id TEXT,
        user_id TEXT,
        symbol TEXT,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        source TEXT NOT NULL,
        index_type TEXT,
        resolved INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS stock_restrictions (
        match_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        max_single INTEGER NOT NULL,
        max_daily INTEGER NOT NULL,
        expires_tick INTEGER NOT NULL,
        tools_locked_until_tick INTEGER NOT NULL DEFAULT 0,
        restriction_type TEXT,
        reason TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (match_id, symbol)
      );

      CREATE TABLE IF NOT EXISTS stock_trade_daily (
        match_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        day INTEGER NOT NULL DEFAULT 1,
        amount INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (match_id, user_id, symbol, day)
      );
    `);

    this.rawDb.run(`
      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_positions_match_user ON positions(match_id, user_id);
      CREATE INDEX IF NOT EXISTS idx_match_status ON matches(status);
      CREATE INDEX IF NOT EXISTS idx_stock_restrictions_match ON stock_restrictions(match_id, symbol);
    `);

    this.migrate();
  }

  /** Idempotent column/table migrations for existing DB files. */
  private migrate() {
    const addColumn = (sql: string) => {
      try {
        this.rawDb.run(sql);
      } catch {
        /* column may already exist */
      }
    };
    addColumn(`ALTER TABLE matches ADD COLUMN justice_score INTEGER NOT NULL DEFAULT 0`);
    addColumn(`ALTER TABLE alerts ADD COLUMN symbol TEXT`);
    addColumn(`ALTER TABLE stock_restrictions ADD COLUMN tools_locked_until_tick INTEGER NOT NULL DEFAULT 0`);
    addColumn(`ALTER TABLE stock_restrictions ADD COLUMN restriction_type TEXT`);
  }

  /**
   * 返回一个 better-sqlite3 风格的语句对象。
   * 每次调用都在底层 sql.js 上重新执行，保证与旧接口 run/get/all 行为一致。
   */
  prepare(sql: string): DbStmt {
    const runOne = (params: any[]) => {
      const bind = normalizeParams(params);
      if (hasBindables(bind)) {
        this.rawDb.run(sql, bind as any);
      } else {
        this.rawDb.run(sql);
      }
    };

    return {
      run: (...params: any[]) => {
        runOne(params);
        const changes = this.rawDb.getRowsModified() as number;
        let lastInsertRowid = 0;
        const res = this.rawDb.exec('SELECT last_insert_rowid() AS id');
        if (res.length && res[0].values.length) {
          lastInsertRowid = Number(res[0].values[0][0]);
        }
        this.save();
        return { changes, lastInsertRowid };
      },

      get: (...params: any[]) => {
        const stmt = this.rawDb.prepare(sql);
        try {
          const bind = normalizeParams(params);
          if (hasBindables(bind)) stmt.bind(bind as any);
          if (stmt.step()) return stmt.getAsObject();
          return undefined;
        } finally {
          stmt.free();
        }
      },

      all: (...params: any[]) => {
        const stmt = this.rawDb.prepare(sql);
        const rows: any[] = [];
        try {
          const bind = normalizeParams(params);
          if (hasBindables(bind)) stmt.bind(bind as any);
          while (stmt.step()) rows.push(stmt.getAsObject());
          return rows;
        } finally {
          stmt.free();
        }
      },
    };
  }

  /**
   * 用于 service 端写事务：
   *   const tx = dbSvc.transaction(() => { ... });
   *   tx();  // 或 tx(arg1, arg2)
   *
   * sql.js 没有内置事务包装，这里手动 BEGIN/COMMIT/ROLLBACK。
   * 只在最外层发起 BEGIN，内层复用同一事务，最外层提交时统一 save()。
   */
  transaction<T extends (...args: any[]) => any>(fn: T): T {
    const wrapped = (...args: any[]) => {
      const outermost = this.txDepth === 0;
      if (outermost) this.rawDb.run('BEGIN');
      this.txDepth++;
      try {
        const result = fn(...args);
        this.txDepth--;
        if (outermost) {
          this.rawDb.run('COMMIT');
          this.save();
        }
        return result;
      } catch (e) {
        this.txDepth--;
        if (outermost) {
          try {
            this.rawDb.run('ROLLBACK');
          } catch {
            /* ignore */
          }
        }
        throw e;
      }
    };
    return wrapped as T;
  }

  exec(sql: string): void {
    // Database.exec 能一次执行多条语句（用于建表 / 迁移等）。
    this.rawDb.exec(sql);
    this.save();
  }

  pragma(s: string): any {
    try {
      this.rawDb.exec(`PRAGMA ${s}`);
    } catch {
      /* sql.js 对部分 pragma（如 WAL）无意义，忽略 */
    }
    return undefined;
  }

  close(): void {
    try {
      this.save();
    } catch {
      /* ignore */
    }
    this.rawDb.close();
  }
}
