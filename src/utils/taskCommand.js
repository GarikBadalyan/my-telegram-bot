// Общее для всех команд менеджера задач: проверка чата, обработка ошибок, форматирование.

const { TaskError } = require('../services/tasks');
const { commandArgs } = require('./telegram');

const TELEGRAM_MESSAGE_LIMIT = 4000; // у Telegram лимит 4096, оставляем запас

// Оборачивает обработчик команды:
//  - задачи личные, поэтому работаем только в личном чате с ботом;
//  - ID пользователя берём из Telegram (ctx.from.id) — его нельзя подделать текстом;
//  - ошибки ввода (TaskError) показываем пользователю, остальные — пишем в лог.
function taskCommand(run, usage) {
    return async (ctx) => {
        if (ctx.chat?.type !== 'private') {
            await ctx.reply('🔒 Задачи личные — напиши мне в личные сообщения.');
            return;
        }

        try {
            await run(ctx, ctx.from?.id, commandArgs(ctx));
        } catch (error) {
            if (error instanceof TaskError) {
                await ctx.reply(`⚠️ ${error.message}` + (usage ? `\n\nПример: ${usage}` : ''));
                return;
            }
            console.error('Task command error:', error);
            await ctx.reply('😔 Что-то пошло не так. Попробуй ещё раз чуть позже.');
        }
    };
}

// То же самое для нажатий на кнопки задач.
// ID пользователя — того, кто НАЖАЛ кнопку (ctx.from.id), а не из callback_data,
// поэтому подделанная кнопка не даст доступа к чужим задачам.
function taskCallback(run) {
    return async (ctx, arg = '') => {
        if (ctx.chat?.type !== 'private') {
            await ctx.reply('🔒 Задачи личные — напиши мне в личные сообщения.');
            return;
        }

        try {
            await run(ctx, ctx.from?.id, arg);
        } catch (error) {
            if (error instanceof TaskError) {
                await ctx.reply(`⚠️ ${error.message}`);
                return;
            }
            console.error('Task button error:', error);
            await ctx.reply('😔 Что-то пошло не так. Попробуй ещё раз чуть позже.');
        }
    };
}

// created_at хранится в UTC («2026-11-11 16:30:00») — показываем по Еревану
function formatDate(createdAt) {
    const date = new Date(createdAt.replace(' ', 'T') + 'Z');
    return new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Asia/Yerevan',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatTask(task) {
    const mark = task.completed ? '✅' : '▫️';
    return `${mark} #${task.id} — ${task.title}\n      🗓 ${formatDate(task.created_at)}`;
}

// Длинный список отправляем несколькими сообщениями, не разрывая строки
async function replyLong(ctx, lines) {
    let chunk = '';
    for (const line of lines) {
        if (chunk && chunk.length + line.length + 1 > TELEGRAM_MESSAGE_LIMIT) {
            await ctx.reply(chunk);
            chunk = '';
        }
        chunk += (chunk ? '\n' : '') + line;
    }
    if (chunk) {
        await ctx.reply(chunk);
    }
}

module.exports = { taskCommand, taskCallback, formatTask, replyLong };
