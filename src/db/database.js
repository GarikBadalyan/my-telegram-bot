// Подключение к SQLite.
// Используем встроенный в Node.js модуль node:sqlite — ничего устанавливать не нужно
// (нужен Node.js 22.13 или новее).

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

// Файл базы по умолчанию: <проект>/storage/tasks.db
// Путь можно поменять переменной DB_PATH в .env
const DEFAULT_DB_PATH = path.join(__dirname, '..', '..', 'storage', 'tasks.db');

// Таблица создаётся при первом запуске; если она уже есть — ничего не происходит
const SCHEMA = `
    CREATE TABLE IF NOT EXISTS tasks (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        title      TEXT    NOT NULL,
        completed  INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
        created_at TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks (user_id, completed);
`;

let db;

// Открывает базу (один раз при запуске бота). ':memory:' — временная база для тестов.
function openDatabase(file = process.env.DB_PATH || DEFAULT_DB_PATH) {
    if (db) {
        return db;
    }
    if (file !== ':memory:') {
        fs.mkdirSync(path.dirname(file), { recursive: true });
    }

    db = new DatabaseSync(file);
    // WAL — более надёжный режим записи; busy_timeout — подождать, если файл занят
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec(SCHEMA);
    return db;
}

function getDb() {
    if (!db) {
        throw new Error('База данных не открыта: сначала вызови openDatabase()');
    }
    return db;
}

function closeDatabase() {
    if (db) {
        db.close();
        db = undefined;
    }
}

module.exports = { openDatabase, getDb, closeDatabase };
