
require('dotenv').config();

const { Bot } = require('node-telegram-bot-api');
const { commands } = require('./src/commands');
const { openDatabase, closeDatabase } = require('./src/db/database');
const { unknownCommandReply } = require('./src/utils/unknownCommand');
const { startMorningScheduler } = require('./src/services/morning');
const aiChat = require('./src/services/aiChat');

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
const commandNames = commands.map((cmd) => cmd.command);

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

    if (!message) {
        return;
    }

    // Сюда доходят только команды, которых нет у бота (известные обработаны выше)
    if (message.startsWith('/')) {
        const reply = unknownCommandReply(ctx, commandNames);
        if (reply) {
            await ctx.reply(reply);
        }
        return;
    }

    // Обычный текст в личном чате — вопрос к ИИ. В группах молчим: иначе бот отвечал бы
    // на каждое сообщение группы (и каждый ответ стоит денег).
    if (ctx.chat?.type !== 'private') {
        return;
    }

    // Не ждём ответа ИИ здесь (это несколько секунд): пока он думает,
    // бот продолжает отвечать на другие сообщения и команды
    aiChat.handleMessage(ctx, message).catch((error) => {
        console.error('AI chat error:', error);
        ctx.reply('😔 Что-то пошло не так. Попробуй ещё раз.').catch(() => {});
    });
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

let stopping = false;

// Запуск бота
const polling = bot.startPolling().then(
    () => {
        if (!stopping) failAndExit('Опрос Telegram неожиданно завершился');
    },
    (error) => {
        if (!stopping) failAndExit('Опрос Telegram остановился с ошибкой', error);
    },
);

// Если бот перестал получать сообщения (неверный токен, второй запущенный бот и т. п.),
// завершаем процесс с ошибкой. Иначе таймер сводки держал бы «мёртвого» бота живым,
// а служба (systemd/pm2) не узнала бы, что его пора перезапустить.
function failAndExit(reason, error) {
    console.error(`${reason}. Завершаю процесс, чтобы служба его перезапустила.`, error ?? '');
    stopMorning();
    closeDatabase();
    process.exit(1);
}

// Утренняя сводка: проверка расписания раз в минуту
const stopMorning = startMorningScheduler(bot.api);

// Аккуратная остановка (Ctrl+C, перезапуск сервиса): дожидаемся остановки бота
// и закрываем базу, чтобы все записи точно сохранились на диск
async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    console.log(`${signal}: останавливаю бота...`);
    stopMorning();
    bot.stop();
    await polling;
    closeDatabase();
    process.exit(0);
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
