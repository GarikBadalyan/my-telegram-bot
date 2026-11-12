// Бизнес-логика менеджера задач: проверки ввода и правила.
// Ничего не знает про Telegram — поэтому её легко проверять тестами.

const repo = require('../db/tasksRepository');

const MAX_TITLE_LENGTH = 200; // символов в тексте задачи
const MAX_ACTIVE_TASKS = 100; // активных задач у одного пользователя
const COMPLETED_SHOW_LIMIT = 50; // сколько последних выполненных показывать

// Ошибка, которую можно показать пользователю как есть
class TaskError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TaskError';
    }
}

function checkUserId(userId) {
    if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new TaskError('Не удалось определить пользователя.');
    }
}

// «  12 » → 12. Только целое положительное число, без минусов, точек и букв.
function parseTaskId(raw) {
    const text = String(raw ?? '').trim();
    if (!text) {
        throw new TaskError('Укажи номер задачи, например: 1');
    }
    if (!/^\d+$/.test(text)) {
        throw new TaskError(`«${text.slice(0, 20)}» — не номер задачи. Номер — это целое число, например: 1`);
    }
    const id = Number(text);
    if (!Number.isSafeInteger(id) || id <= 0) {
        throw new TaskError('Такой задачи нет: номер должен быть больше нуля.');
    }
    return id;
}

// Убираем лишние пробелы и переносы строк, проверяем длину
function normalizeTitle(raw) {
    const title = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!title) {
        throw new TaskError('Текст задачи не может быть пустым.');
    }
    const length = Array.from(title).length; // считаем символы, а не байты (важно для эмодзи)
    if (length > MAX_TITLE_LENGTH) {
        throw new TaskError(`Слишком длинный текст: ${length} символов (максимум ${MAX_TITLE_LENGTH}).`);
    }
    return title;
}

// Задача пользователя или ошибка «не найдена».
// Для чужой задачи ответ тот же — так нельзя даже узнать, существует ли она.
function getOwnTask(userId, taskId) {
    const task = repo.findTask(userId, taskId);
    if (!task) {
        throw new TaskError(`Задача #${taskId} не найдена.`);
    }
    return task;
}

function addTask(userId, rawTitle) {
    checkUserId(userId);
    const title = normalizeTitle(rawTitle);
    if (repo.countTasks(userId, false) >= MAX_ACTIVE_TASKS) {
        throw new TaskError(
            `У тебя уже ${MAX_ACTIVE_TASKS} активных задач — это максимум. ` +
                'Выполни или удали какие-нибудь: /done или /delete.',
        );
    }
    return repo.insertTask(userId, title);
}

function listActive(userId) {
    checkUserId(userId);
    return repo.listTasks(userId, false);
}

function listCompleted(userId) {
    checkUserId(userId);
    return {
        tasks: repo.listTasks(userId, true, COMPLETED_SHOW_LIMIT),
        total: repo.countTasks(userId, true),
    };
}

// Одна задача пользователя (например, чтобы переспросить «Удалить «…»?»)
function getTask(userId, rawId) {
    checkUserId(userId);
    return getOwnTask(userId, parseTaskId(rawId));
}

function completeTask(userId, rawId) {
    checkUserId(userId);
    const task = getOwnTask(userId, parseTaskId(rawId));
    if (task.completed) {
        throw new TaskError(`Задача #${task.id} уже выполнена.`);
    }
    repo.markCompleted(userId, task.id);
    return { ...task, completed: true };
}

function editTask(userId, rawId, rawTitle) {
    checkUserId(userId);
    const taskId = parseTaskId(rawId);
    const title = normalizeTitle(rawTitle);
    const task = getOwnTask(userId, taskId);
    repo.updateTitle(userId, task.id, title);
    return { oldTitle: task.title, task: { ...task, title } };
}

function deleteTask(userId, rawId) {
    checkUserId(userId);
    const task = getOwnTask(userId, parseTaskId(rawId));
    repo.deleteTask(userId, task.id);
    return task;
}

module.exports = {
    TaskError,
    MAX_TITLE_LENGTH,
    MAX_ACTIVE_TASKS,
    COMPLETED_SHOW_LIMIT,
    parseTaskId,
    normalizeTitle,
    addTask,
    listActive,
    listCompleted,
    getTask,
    completeTask,
    editTask,
    deleteTask,
};
