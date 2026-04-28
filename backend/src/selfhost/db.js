import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';

const UPSERT_REGEX = /ON\s+CONFLICT\s*\(([^)]+)\)\s*DO\s+UPDATE\s+SET\s+([\s\S]+)$/i;
const KEYISH_COLUMN_REGEX = /(^id$|_id$|email$|username$|role$|permission$|status$|subscription_status$|auth_provider$|presence$|discriminator$|type$|name$|title$|priority$|due_date$|resource_type$|resource_name$|attachment_type$)/i;
const LONGTEXT_COLUMNS = new Set(['content', 'data', 'attachment_data', 'description', 'about', 'banner_image']);

function normalizeIdentifier(identifier) {
  return identifier.replace(/[`"']/g, '').trim();
}

function translateUpsert(sql) {
  const match = sql.match(UPSERT_REGEX);
  if (!match) return sql;

  const assignments = match[2]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/excluded\.([a-zA-Z0-9_]+)/g, 'VALUES($1)'));

  return `${sql.slice(0, match.index).trim()} ON DUPLICATE KEY UPDATE ${assignments.join(', ')}`;
}

function translateColumnDefinition(line) {
  const match = line.match(/^(\s*)([a-zA-Z_][a-zA-Z0-9_]*)(\s+)TEXT\b([\s\S]*)$/i);
  if (!match) {
    return line.replace(/\bBOOLEAN\b/gi, 'TINYINT(1)');
  }

  const [, indent, rawName, spacing, tail] = match;
  const name = normalizeIdentifier(rawName);
  const upperTail = tail.toUpperCase();

  let type = 'TEXT';
  if (upperTail.includes('PRIMARY KEY') || upperTail.includes('UNIQUE')) type = 'VARCHAR(191)';
  else if (LONGTEXT_COLUMNS.has(name)) type = 'LONGTEXT';
  else if (upperTail.includes('DEFAULT') || upperTail.includes('NOT NULL') || KEYISH_COLUMN_REGEX.test(name)) type = 'VARCHAR(255)';

  return `${indent}${rawName}${spacing}${type}${tail}`.replace(/\bBOOLEAN\b/gi, 'TINYINT(1)');
}

function translateCreateTable(sql) {
  if (!/^CREATE\s+TABLE/i.test(sql)) return sql;
  return sql
    .split('\n')
    .map((line) => translateColumnDefinition(line))
    .join('\n');
}

export function translateSql(sql) {
  let translated = sql.trim();
  if (!translated) return translated;

  translated = translated.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT IGNORE INTO');
  translated = translateUpsert(translated);
  translated = translateCreateTable(translated);
  translated = translated.replace(/\bBOOLEAN\b/gi, 'TINYINT(1)');
  return translated;
}

function splitSqlStatements(content) {
  const statements = [];
  let current = '';
  let quote = null;
  let lineComment = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (lineComment) {
      if (char === '\n') {
        lineComment = false;
        current += char;
      }
      continue;
    }

    if (!quote && char === '-' && next === '-') {
      lineComment = true;
      index += 1;
      continue;
    }

    if ((char === '"' || char === "'" || char === '`')) {
      if (quote === char) quote = null;
      else if (!quote) quote = char;
      current += char;
      continue;
    }

    if (!quote && char === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) statements.push(current.trim());
  return statements;
}

async function executeSqlFile(connection, sqlPath) {
  const content = await fs.readFile(sqlPath, 'utf8');
  const statements = splitSqlStatements(content);
  for (const statement of statements) {
    await connection.query(translateSql(statement));
  }
}

export async function createMariaDbPool(env = process.env) {
  const host = env.DB_HOST || env.MARIADB_HOST || '127.0.0.1';
  const port = Number(env.DB_PORT || env.MARIADB_PORT || 3306);
  const user = env.DB_USER || env.MARIADB_USER || 'creative_planner';
  const password = env.DB_PASSWORD || env.MARIADB_PASSWORD || '';
  const database = env.DB_NAME || env.MARIADB_DATABASE || 'creative_planner';
  const adminUser = env.DB_ROOT_USER || 'root';
  const adminPassword = env.DB_ROOT_PASSWORD || '';

  let lastError = null;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      if (adminPassword || user === 'root') {
        const adminPool = mysql.createPool({
          host,
          port,
          user: adminPassword ? adminUser : user,
          password: adminPassword || password,
          waitForConnections: true,
          connectionLimit: 10,
          charset: 'utf8mb4',
          multipleStatements: false,
        });
        await adminPool.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await adminPool.end();
      }

      return mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        waitForConnections: true,
        connectionLimit: 10,
        charset: 'utf8mb4',
        namedPlaceholders: false,
        multipleStatements: false,
      });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  throw lastError || new Error('MariaDB connection failed');
}

export async function initializeMariaDb(pool, backendRoot) {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS selfhost_migrations (
        name VARCHAR(255) PRIMARY KEY,
        applied_at BIGINT NOT NULL
      )
    `);

    const files = ['schema.sql'];
    const directoryEntries = await fs.readdir(backendRoot, { withFileTypes: true });
    for (const entry of directoryEntries) {
      if (entry.isFile() && /^migration_.*\.sql$/i.test(entry.name)) files.push(entry.name);
    }

    files.sort((left, right) => {
      if (left === 'schema.sql') return -1;
      if (right === 'schema.sql') return 1;
      return left.localeCompare(right);
    });

    for (const fileName of files) {
      const [rows] = await connection.query('SELECT name FROM selfhost_migrations WHERE name = ? LIMIT 1', [fileName]);
      if (Array.isArray(rows) && rows.length > 0) continue;

      await executeSqlFile(connection, path.join(backendRoot, fileName));
      await connection.query('INSERT INTO selfhost_migrations (name, applied_at) VALUES (?, ?)', [fileName, Date.now()]);
    }
  } finally {
    connection.release();
  }
}

class MariaDbStatement {
  constructor(pool, sqlText) {
    this.pool = pool;
    this.sqlText = translateSql(sqlText);
    this.params = [];
  }

  bind(...params) {
    this.params = params;
    return this;
  }

  async first() {
    const [rows] = await this.pool.query(this.sqlText, this.params);
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  async all() {
    const [rows] = await this.pool.query(this.sqlText, this.params);
    return { results: Array.isArray(rows) ? rows : [] };
  }

  async run() {
    const [result] = await this.pool.query(this.sqlText, this.params);
    return {
      success: true,
      meta: {
        changes: Number(result?.affectedRows || 0),
        last_row_id: result?.insertId ?? null,
      },
    };
  }
}

export function createD1CompatDatabase(pool) {
  return {
    prepare(sqlText) {
      return new MariaDbStatement(pool, sqlText);
    },
  };
}