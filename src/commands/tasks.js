// /tasks — список активных задач с кнопками «✅ Готово» и «🗑 Удалить».
//
// У Telegram не больше 100 кнопок в сообщении, поэтому список постраничный:
// PAGE_SIZE задач на странице и стрелки ◀️ ▶️.
//
// callback_data кнопок (лимит Telegram — 64 байта):
//   task:page:<страница>         — показать страницу
//   task:done:<id>:<страница>    — ✅ отметить выполненной
//   task:del:<id>:<страница>     — 🗑 спросить «Удалить?»
//   task:delyes:<id>:<страница>  — подтвердить удаление
//   task:noop                    — счётчик «1/3», ничего не делает
//
// Номер страницы в кнопке нужен, чтобы после действия остаться на той же странице.

const { InlineKeyboardBuilder } = require('node-telegram-bot-api');
const tasks = require('../services/tasks');
const { taskCommand, taskCallback, formatTask } = require('../utils/taskCommand');
const { editPressedMessage } = require('../utils/telegram');

const PAGE_SIZE = 5;

// Номер страницы из кнопки; всё странное превращаем в первую страницу
function toPage(raw) {
    const page = Number(raw);
    return Number.isSafeInteger(page) && page >= 0 ? page : 0;
}

// Текст и кнопки одной страницы списка. notice — строка сверху («Задача выполнена»).
function renderPage(userId, requestedPage = 0, notice = '') {
    const list = tasks.listActive(userId);
    const top = notice ? [notice, ''] : [];

    if (list.length === 0) {
        return {
            text: [...top, '📭 Активных задач нет.', '', 'Добавить: /add Купить продукты'].join('\n'),
            reply_markup: undefined,
        };
    }

    const pages = Math.ceil(list.length / PAGE_SIZE);
    const page = Math.min(requestedPage, pages - 1); // после удаления страница могла исчезнуть
    const shown = list.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const keyboard = new InlineKeyboardBuilder();
    for (const task of shown) {
        keyboard
            .text(`✅ Готово #${task.id}`, `task:done:${task.id}:${page}`)
            .text(`🗑 Удалить #${task.id}`, `task:del:${task.id}:${page}`)
            .row();
    }
    if (pages > 1) {
        if (page > 0) keyboard.text('◀️', `task:page:${page - 1}`);
        keyboard.text(`${page + 1}/${pages}`, 'task:noop');
        if (page < pages - 1) keyboard.text('▶️', `task:page:${page + 1}`);
    }

    const title =
        `📝 Активные задачи (${list.length})` + (pages > 1 ? ` · стр. ${page + 1}/${pages}` : '') + ':';

    return {
        text: [
            ...top,
            title,
            '',
            ...shown.map(formatTask),
            '',
            'Изменить текст: /edit 1 новый текст',
        ].join('\n'),
        reply_markup: keyboard.build(),
    };
}

function confirmDeleteKeyboard(taskId, page) {
    return new InlineKeyboardBuilder()
        .text('🗑 Да, удалить', `task:delyes:${taskId}:${page}`)
        .text('↩️ Отмена', `task:page:${page}`)
        .build();
}

// Новое сообщение со списком (команда /tasks и кнопка «📝 Мои задачи» в меню)
const sendList = taskCommand(async (ctx, userId) => {
    const { text, reply_markup } = renderPage(userId);
    await ctx.reply(text, { reply_markup });
});

// Нажатия на кнопки под списком: меняем то же сообщение, а не шлём новое
const onTaskButton = taskCallback(async (ctx, userId, arg) => {
    const [action, rawId, rawPage] = arg.split(':');

    if (action === 'noop') return;

    const page = toPage(action === 'page' ? rawId : rawPage);
    let notice = '';

    try {
        if (action === 'done') {
            const task = tasks.completeTask(userId, rawId);
            notice = `🎉 Задача #${task.id} выполнена: ${task.title}`;
        } else if (action === 'del') {
            // Удаление необратимо — сначала переспрашиваем
            const task = tasks.getTask(userId, rawId);
            await editPressedMessage(
                ctx,
                `🗑 Удалить задачу #${task.id}?\n\n${task.title}`,
                confirmDeleteKeyboard(task.id, page),
            );
            return;
        } else if (action === 'delyes') {
            const task = tasks.deleteTask(userId, rawId);
            notice = `🗑 Задача #${task.id} удалена: ${task.title}`;
        } else if (action !== 'page') {
            notice = '⚠️ Неизвестная кнопка.';
        }
    } catch (error) {
        // Например, нажали кнопку под старым списком, а задачу уже удалили командой
        if (!(error instanceof tasks.TaskError)) throw error;
        notice = `⚠️ ${error.message}`;
    }

    const { text, reply_markup } = renderPage(userId, page, notice);
    await editPressedMessage(ctx, text, reply_markup);
});

module.exports = {
    command: 'tasks',
    description: 'Мои активные задачи',
    handler: sendList,

    callbacks: {
        tasks: sendList, // кнопка «📝 Мои задачи» в главном меню
        task: onTaskButton, // кнопки под списком задач
    },
};
