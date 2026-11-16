// Диалог с ИИ в личных сообщениях: история, лимиты, очередь.
//
// Настройки в .env (необязательные):
//   AI_ALLOWED_USERS=123456789,987654321  — кому разрешён ИИ (Telegram ID через запятую);
//                                           пусто — всем. Каждый запрос стоит денег!
//   AI_HOURLY_LIMIT=30                     — сколько вопросов в час можно задать одному человеку

const ai = require('./ai');
const { replyLong } = require('../utils/telegram');

const MAX_HISTORY_MESSAGES = 20; // помним последние 10 пар «вопрос — ответ»
const IDLE_RESET_MS = 30 * 60 * 1000; // 30 минут тишины — начинаем разговор заново
const MAX_INPUT_LENGTH = 4000; // символов в одном вопросе
const TYPING_REFRESH_MS = 4000; // «печатает…» в Telegram гаснет через ~5 секунд

// История хранится в памяти: после перезапуска бота разговор начинается заново.
// В историю кладём только текст ответов (без служебных блоков модели) — так её можно
// безопасно обрезать сверху, когда она становится длинной.
const histories = new Map(); // chatId → { messages, updatedAt }
const requestLog = new Map(); // userId → [время запроса, ...] за последний час
const queues = new Map(); // chatId → цепочка обработки (по одному вопросу за раз)

function allowedUsers() {
    return (process.env.AI_ALLOWED_USERS || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
}

function isAllowed(userId) {
    const list = allowedUsers();
    return list.length === 0 || list.includes(String(userId));
}

function hourlyLimit() {
    const n = Number(process.env.AI_HOURLY_LIMIT);
    return Number.isInteger(n) && n > 0 ? n : 30;
}

// true — можно спрашивать (и запрос засчитан), false — лимит исчерпан
function takeQuota(userId, now = Date.now()) {
    const recent = (requestLog.get(userId) || []).filter((t) => now - t < 60 * 60 * 1000);
    if (recent.length >= hourlyLimit()) {
        requestLog.set(userId, recent);
        return false;
    }
    recent.push(now);
    requestLog.set(userId, recent);
    return true;
}

function getHistory(chatId, now = Date.now()) {
    // Заодно чистим давно молчащие чаты, чтобы память не росла
    if (histories.size > 500) {
        for (const [id, h] of histories) {
            if (now - h.updatedAt > IDLE_RESET_MS) histories.delete(id);
        }
    }
    const h = histories.get(chatId);
    if (!h || now - h.updatedAt > IDLE_RESET_MS) {
        const fresh = { messages: [], updatedAt: now };
        histories.set(chatId, fresh);
        return fresh;
    }
    return h;
}

// Оставляем последние сообщения; история всегда начинается с вопроса пользователя
function trim(messages) {
    while (messages.length > MAX_HISTORY_MESSAGES || (messages.length && messages[0].role !== 'user')) {
        messages.shift();
    }
}

function resetHistory(chatId) {
    histories.delete(chatId);
}

// Показываем «печатает…», пока ждём ответ. Возвращает функцию, которая это прекращает.
function keepTyping(ctx) {
    const send = () =>
        ctx.api.sendChatAction({ chat_id: ctx.chatId, action: 'typing' }).catch(() => {});
    send();
    const timer = setInterval(send, TYPING_REFRESH_MS);
    return () => clearInterval(timer);
}

async function answer(ctx, text) {
    const userId = ctx.from?.id;
    const chatId = ctx.chatId;

    if (!isAllowed(userId)) {
        await ctx.reply('🔒 Вопросы к ИИ доступны только владельцу бота.\n\nВсе команды: /help');
        return;
    }
    if (text.length > MAX_INPUT_LENGTH) {
        await ctx.reply(`⚠️ Слишком длинный вопрос (максимум ${MAX_INPUT_LENGTH} символов). Сократи, пожалуйста.`);
        return;
    }
    if (!ai.isConfigured()) {
        await ctx.reply('🤖 ИИ пока не подключён: владельцу бота нужно добавить ANTHROPIC_API_KEY в .env.');
        return;
    }
    if (!takeQuota(userId)) {
        await ctx.reply(`⏳ Лимит — ${hourlyLimit()} вопросов в час. Попробуй немного позже.`);
        return;
    }

    const history = getHistory(chatId);
    history.messages.push({ role: 'user', content: text });
    trim(history.messages);

    const stopTyping = keepTyping(ctx);
    try {
        const { text: reply, truncated } = await ai.ask([...history.messages]);
        history.messages.push({ role: 'assistant', content: reply });
        history.updatedAt = Date.now();
        trim(history.messages);
        stopTyping();
        await replyLong(ctx, [reply, ...(truncated ? ['', '✂️ (ответ получился слишком длинным и обрезан)'] : [])]);
    } catch (error) {
        stopTyping();
        // Неудачный вопрос убираем из истории, чтобы не мешал следующим
        history.messages.pop();
        if (error instanceof ai.AiError) {
            if (error.cause) console.error('AI error:', error.cause.message ?? error.cause);
            await ctx.reply(error.message);
            return;
        }
        throw error;
    }
}

// Точка входа: обычное текстовое сообщение в личном чате.
// Вопросы одного чата обрабатываются строго по очереди.
function handleMessage(ctx, text) {
    const chatId = ctx.chatId;
    const previous = queues.get(chatId) || Promise.resolve();
    const current = previous.then(() => answer(ctx, text));
    const tail = current.catch(() => {});
    queues.set(chatId, tail);
    tail.then(() => {
        if (queues.get(chatId) === tail) queues.delete(chatId);
    });
    return current;
}

module.exports = {
    handleMessage,
    resetHistory,
    MAX_HISTORY_MESSAGES,
    // для тестов
    _reset: () => {
        histories.clear();
        requestLog.clear();
        queues.clear();
    },
    _history: (chatId) => histories.get(chatId)?.messages,
};
