// Все SQL-запросы к таблице tasks.
//
// Правила этого файла:
//  1. Только параметризованные запросы: значения передаются через «?»,
//     а не вклеиваются в текст SQL. Так SQL-инъекция невозможна.
//  2. В КАЖДОМ запросе есть условие user_id = ?. Поэтому пользователь физически
//     не может прочитать, изменить или удалить чужую задачу, даже зная её ID.

const { getDb } = require('./database');

const COLUMNS = 'id, user_id, title, completed, created_at';

// SQLite хранит completed как 0/1 — превращаем в true/false
function toTask(row) {
    return row ? { ...row, completed: row.completed === 1 } : undefined;
}

function insertTask(userId, title) {
    const row = getDb()
        .prepare(`INSERT INTO tasks (user_id, title) VALUES (?, ?) RETURNING ${COLUMNS}`)
        .get(userId, title);
    return toTask(row);
}

function findTask(userId, taskId) {
    const row = getDb()
        .prepare(`SELECT ${COLUMNS} FROM tasks WHERE id = ? AND user_id = ?`)
        .get(taskId, userId);
    return toTask(row);
}

// Активные — от старых к новым; выполненные — от новых к старым
function listTasks(userId, completed, limit = -1) {
    const order = completed ? 'DESC' : 'ASC';
    return getDb()
        .prepare(
            `SELECT ${COLUMNS} FROM tasks
             WHERE user_id = ? AND completed = ?
             ORDER BY id ${order}
             LIMIT ?`,
        )
        .all(userId, completed ? 1 : 0, limit)
        .map(toTask);
}

function countTasks(userId, completed) {
    return getDb()
        .prepare('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND completed = ?')
        .get(userId, completed ? 1 : 0).n;
}

// Функции ниже возвращают true, если строка действительно изменилась/удалилась

function markCompleted(userId, taskId) {
    const result = getDb()
        .prepare('UPDATE tasks SET completed = 1 WHERE id = ? AND user_id = ? AND completed = 0')
        .run(taskId, userId);
    return result.changes > 0;
}

function updateTitle(userId, taskId, title) {
    const result = getDb()
        .prepare('UPDATE tasks SET title = ? WHERE id = ? AND user_id = ?')
        .run(title, taskId, userId);
    return result.changes > 0;
}

function deleteTask(userId, taskId) {
    const result = getDb()
        .prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')
        .run(taskId, userId);
    return result.changes > 0;
}

module.exports = {
    insertTask,
    findTask,
    listTasks,
    countTasks,
    markCompleted,
    updateTitle,
    deleteTask,
};
