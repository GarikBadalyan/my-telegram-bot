
require('dotenv').config();

const { Bot } = require('node-telegram-bot-api');
const { commands } = require('./src/commands');
const { openDatabase, closeDatabase } = require('./src/db/database');

const token = process.env.BOT_TOKEN;

if (!token) {
    throw new Error('BOT_TOKEN is missing in .env file');
}

// База задач (SQLite). Файл и таблица создаются автоматически при первом запуске.
openDatabase();


const bot = new Bot(token);

// Регистрируем все команды из папки src/commands
for (const cmd of commands) {
    bot.command(cmd.command, cmd.handler);
}

// Собираем обработчики кнопок всех команд в одну таблицу: callback_data → функция
const callbackHandlers = {};
for (const cmd of commands) {
    Object.assign(callbackHandlers, cmd.callbacks);
}

// Обработка нажатий на кнопки
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery?.data || '';

    // Убираем «часики» на кнопке
    await ctx.answerCallbackQuery();

    // Сначала ищем точное совпадение («ask:yes»), потом — по части до двоеточия:
    // «joke:7» → обработчик «joke» с аргументом «7»,
    // «task:done:5:0» → обработчик «task» с аргументом «done:5:0»
    if (callbackHandlers[data]) {
        await callbackHandlers[data](ctx);
        return;
    }
    const colon = data.indexOf(':');
    const key = colon === -1 ? data : data.slice(0, colon);
    const arg = colon === -1 ? undefined : data.slice(colon + 1);
    if (callbackHandlers[key]) {
        await callbackHandlers[key](ctx, arg);
        return;
    }

    await ctx.reply('Неизвестная кнопка 🤔');
});

// Ответ на обычные текстовые сообщения
bot.on('message', async (ctx) => {
    const message = ctx.message?.text;

    if (!message || message.startsWith('/')) {
        return;
    }

    await ctx.reply(`Ты написал: ${message}`);
});

// Обработка ошибок
bot.catch((error) => {
    console.error('Bot error:', error);
});


// Регистрируем команды в меню Telegram (кнопка «Меню» рядом с полем ввода)
bot.api
    .setMyCommands({
        commands: commands.map(({ command, description }) => ({ command, description })),
    })
    .catch(console.error);

// Запуск бота
const polling = bot.startPolling().catch(console.error);

// Аккуратная остановка (Ctrl+C, перезапуск сервиса): дожидаемся остановки бота
// и закрываем базу, чтобы все записи точно сохранились на диск
let stopping = false;
async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`${signal}: останавливаю бота...`);
    bot.stop();
    await polling;
    closeDatabase();
    process.exit(0);
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
