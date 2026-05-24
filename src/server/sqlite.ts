import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

type SqliteValue = string | number | bigint | null;
type QueryOperation = 'select' | 'insert' | 'update' | 'delete';

interface QuerySuccess<T = unknown> {
  data: T;
  error: null;
  count?: number | null;
}

interface QueryEmptySuccess {
  data: null;
  error: null;
  count?: number | null;
}

interface QueryFailure {
  data: null;
  error: Error;
  count?: null;
}

type QueryResult<T = unknown> = QuerySuccess<T> | QueryEmptySuccess | QueryFailure;
type SingleQueryResult<T> = QuerySuccess<T> | QueryFailure;
type MaybeSingleQueryResult<T> =
  | {
      data: T | null;
      error: null;
    }
  | QueryFailure;

interface Filter {
  column: string;
  operator: '=' | '<>' | '>=' | '<=' | 'is-not' | 'in';
  value: SqliteValue | SqliteValue[];
}

interface Ordering {
  column: string;
  ascending: boolean;
}

let database: SqliteDatabase | null = null;

const DEFAULT_DATABASE_PATH = path.join(process.cwd(), 'data', 'attend.sqlite');
const VERCEL_RUNTIME_DATABASE_PATH = path.join('/tmp', 'attend.sqlite');

function isVercelRuntime() {
  return process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
}

function databasePath() {
  if (process.env.SQLITE_PATH) return process.env.SQLITE_PATH;
  return isVercelRuntime() ? VERCEL_RUNTIME_DATABASE_PATH : DEFAULT_DATABASE_PATH;
}

function prepareRuntimeDatabase(filePath: string) {
  if (process.env.SQLITE_PATH || !isVercelRuntime() || existsSync(filePath)) {
    return;
  }
  if (existsSync(DEFAULT_DATABASE_PATH)) {
    mkdirSync(path.dirname(filePath), { recursive: true });
    copyFileSync(DEFAULT_DATABASE_PATH, filePath);
  }
}

function assertIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`SQLite 식별자가 올바르지 않습니다: ${identifier}`);
  }
  return identifier;
}

function quoteIdentifier(identifier: string) {
  return `"${assertIdentifier(identifier)}"`;
}

function projection(columns: string | null) {
  if (!columns || columns.trim() === '*') return '*';
  return columns
    .split(',')
    .map((column) => column.trim())
    .filter(Boolean)
    .map(quoteIdentifier)
    .join(', ');
}

function placeholders(count: number) {
  return Array.from({ length: count }, () => '?').join(', ');
}

function normalizeRow<T>(row: unknown) {
  return row as T;
}

function databaseError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function initializeDatabase(db: DatabaseSync) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_number TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      grade INTEGER NOT NULL,
      class_number INTEGER NOT NULL,
      seat_number INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'teacher')),
      student_id INTEGER UNIQUE REFERENCES students(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS browser_devices (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      action TEXT NOT NULL CHECK (action IN ('check_in', 'check_out', 'absent', 'present')),
      timestamp TEXT NOT NULL,
      device_id TEXT NOT NULL,
      device_label TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS web_sessions (
      token_hash TEXT PRIMARY KEY,
      csrf_token_hash TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_devices_student
      ON browser_devices(student_id);

    CREATE INDEX IF NOT EXISTS idx_attendance_student_time
      ON attendance_records(student_id, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_students_seat_number
      ON students(seat_number, student_number);

    CREATE INDEX IF NOT EXISTS idx_sessions_user
      ON web_sessions(user_id);
  `);
}

class SqliteDatabase {
  constructor(private readonly db: DatabaseSync) {}

  from(table: string) {
    return new SqliteQueryBuilder(this.db, table);
  }
}

class SqliteQueryBuilder {
  private operation: QueryOperation = 'select';
  private selectedColumns: string | null = '*';
  private countExact = false;
  private headOnly = false;
  private insertPayload: Record<string, SqliteValue> | null = null;
  private updatePayload: Record<string, SqliteValue> | null = null;
  private filters: Filter[] = [];
  private orderings: Ordering[] = [];
  private limitCount: number | null = null;

  constructor(
    private readonly db: DatabaseSync,
    private readonly table: string,
  ) {
    assertIdentifier(table);
  }

  select(columns = '*', options: { count?: 'exact'; head?: boolean } = {}) {
    if (this.operation === 'select') {
      this.operation = 'select';
    }
    this.selectedColumns = columns;
    this.countExact = options.count === 'exact';
    this.headOnly = options.head === true;
    return this;
  }

  insert(payload: Record<string, SqliteValue>) {
    this.operation = 'insert';
    this.insertPayload = payload;
    return this;
  }

  update(payload: Record<string, SqliteValue>) {
    this.operation = 'update';
    this.updatePayload = payload;
    return this;
  }

  delete() {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: SqliteValue) {
    this.filters.push({ column, operator: '=', value });
    return this;
  }

  neq(column: string, value: SqliteValue) {
    this.filters.push({ column, operator: '<>', value });
    return this;
  }

  gte(column: string, value: SqliteValue) {
    this.filters.push({ column, operator: '>=', value });
    return this;
  }

  lte(column: string, value: SqliteValue) {
    this.filters.push({ column, operator: '<=', value });
    return this;
  }

  not(column: string, operator: 'is', value: SqliteValue) {
    if (operator !== 'is' || value !== null) {
      throw new Error('지원하지 않는 SQLite not 조건입니다.');
    }
    this.filters.push({ column, operator: 'is-not', value });
    return this;
  }

  in(column: string, values: SqliteValue[]) {
    this.filters.push({ column, operator: 'in', value: values });
    return this;
  }

  order(column: string, options: { ascending?: boolean } = {}) {
    this.orderings.push({ column, ascending: options.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  returns<T>() {
    return this.execute<T>();
  }

  maybeSingle<T>() {
    return this.executeRows<T>().then<MaybeSingleQueryResult<T>>(
      ({ rows, error }) => {
        if (error) return { data: null, error };
        return { data: rows[0] ?? null, error: null };
      },
    );
  }

  single<T>() {
    return this.executeRows<T>().then<SingleQueryResult<T>>(({ rows, error }) => {
      if (error) return { data: null, error };
      if (!rows[0]) {
        return { data: null, error: new Error('SQLite row not found') };
      }
      return { data: rows[0], error: null };
    });
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?:
      | ((value: QueryResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private execute<T = unknown>(): Promise<QueryResult<T>> {
    if (this.headOnly && this.countExact && this.operation === 'select') {
      return this.executeCount<T>();
    }
    return this.executeRows<T>().then(({ rows, error }) => {
      if (error) return { data: null, error };
      return { data: rows as T, error: null };
    });
  }

  private async executeCount<T>(): Promise<QueryResult<T>> {
    try {
      const { whereSql, params } = this.whereClause();
      const row = this.db
        .prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(this.table)}${whereSql}`)
        .get(...params) as { count: number } | undefined;
      return { data: null, error: null, count: Number(row?.count ?? 0) };
    } catch (error) {
      return { data: null, error: databaseError(error), count: null };
    }
  }

  private async executeRows<T>(): Promise<
    { rows: T[]; error: null } | { rows: T[]; error: Error }
  > {
    try {
      const rows = this.executeRowsSync<T>();
      return { rows, error: null };
    } catch (error) {
      return { rows: [] as T[], error: databaseError(error) };
    }
  }

  private executeRowsSync<T>() {
    if (this.operation === 'insert') return this.executeInsert<T>();
    if (this.operation === 'update') return this.executeUpdate<T>();
    if (this.operation === 'delete') return this.executeDelete<T>();
    return this.executeSelect<T>();
  }

  private executeSelect<T>() {
    const { whereSql, params } = this.whereClause();
    const orderSql = this.orderClause();
    const limitSql = this.limitCount == null ? '' : ` LIMIT ${this.limitCount}`;
    return this.db
      .prepare(
        `SELECT ${projection(this.selectedColumns)} FROM ${quoteIdentifier(this.table)}${whereSql}${orderSql}${limitSql}`,
      )
      .all(...params)
      .map(normalizeRow<T>);
  }

  private executeInsert<T>() {
    if (!this.insertPayload) throw new Error('SQLite insert payload is missing');
    const columns = Object.keys(this.insertPayload);
    const params = columns.map((column) => this.insertPayload?.[column] ?? null);
    const returningSql =
      this.selectedColumns && this.selectedColumns !== '*'
        ? ` RETURNING ${projection(this.selectedColumns)}`
        : '';
    const statement = this.db.prepare(
      `INSERT INTO ${quoteIdentifier(this.table)} (${columns
        .map(quoteIdentifier)
        .join(', ')}) VALUES (${placeholders(columns.length)})${returningSql}`,
    );
    if (!returningSql) {
      statement.run(...params);
      return [] as T[];
    }
    return statement.all(...params).map(normalizeRow<T>);
  }

  private executeUpdate<T>() {
    if (!this.updatePayload) throw new Error('SQLite update payload is missing');
    const columns = Object.keys(this.updatePayload);
    const params = columns.map((column) => this.updatePayload?.[column] ?? null);
    const { whereSql, params: whereParams } = this.whereClause();
    const returningSql =
      this.selectedColumns && this.selectedColumns !== '*'
        ? ` RETURNING ${projection(this.selectedColumns)}`
        : '';
    const statement = this.db.prepare(
      `UPDATE ${quoteIdentifier(this.table)} SET ${columns
        .map((column) => `${quoteIdentifier(column)} = ?`)
        .join(', ')}${whereSql}${returningSql}`,
    );
    if (!returningSql) {
      statement.run(...params, ...whereParams);
      return [] as T[];
    }
    return statement.all(...params, ...whereParams).map(normalizeRow<T>);
  }

  private executeDelete<T>() {
    const { whereSql, params } = this.whereClause();
    const returningSql =
      this.selectedColumns && this.selectedColumns !== '*'
        ? ` RETURNING ${projection(this.selectedColumns)}`
        : '';
    const statement = this.db.prepare(
      `DELETE FROM ${quoteIdentifier(this.table)}${whereSql}${returningSql}`,
    );
    if (!returningSql) {
      statement.run(...params);
      return [] as T[];
    }
    return statement.all(...params).map(normalizeRow<T>);
  }

  private whereClause() {
    if (!this.filters.length) return { whereSql: '', params: [] as SqliteValue[] };
    const params: SqliteValue[] = [];
    const clauses = this.filters.map((filter) => {
      const column = quoteIdentifier(filter.column);
      if (filter.operator === 'is-not') return `${column} IS NOT NULL`;
      if (filter.operator === 'in') {
        const values = Array.isArray(filter.value) ? filter.value : [];
        if (!values.length) return '0 = 1';
        params.push(...values);
        return `${column} IN (${placeholders(values.length)})`;
      }
      if (filter.value === null && filter.operator === '=') return `${column} IS NULL`;
      if (filter.value === null && filter.operator === '<>') {
        return `${column} IS NOT NULL`;
      }
      params.push(filter.value as SqliteValue);
      return `${column} ${filter.operator} ?`;
    });
    return { whereSql: ` WHERE ${clauses.join(' AND ')}`, params };
  }

  private orderClause() {
    if (!this.orderings.length) return '';
    return ` ORDER BY ${this.orderings
      .map(
        (ordering) =>
          `${quoteIdentifier(ordering.column)} ${ordering.ascending ? 'ASC' : 'DESC'}`,
      )
      .join(', ')}`;
  }
}

export function getDatabase() {
  if (database) return database;

  const filePath = databasePath();
  prepareRuntimeDatabase(filePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  const sqlite = new DatabaseSync(filePath);
  initializeDatabase(sqlite);
  database = new SqliteDatabase(sqlite);
  return database;
}
