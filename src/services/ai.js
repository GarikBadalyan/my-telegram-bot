// Ответы на вопросы через Claude (официальный SDK Anthropic).
// Ключ берётся из .env: ANTHROPIC_API_KEY=... (получить: https://platform.claude.com → API Keys)

const sdk = require('@anthropic-ai/sdk');

const Anthropic = sdk.default ?? sdk;

const MODEL = 'claude-opus-5-5';
const MAX_TOKENS = 16000; // предел на размышления + ответ; обычный ответ в чате намного короче

// Неизменный системный промпт (без даты и прочего «плавающего» текста)
const SYSTEM_PROMPT = [
    'Ты — дружелюбный помощник в Telegram-боте. Отвечай на языке пользователя',
    '(обычно русский или армянский), по делу и кратко: как в переписке в мессенджере,',
    'обычно 1–5 предложений; подробнее — только если пользователь просит или без этого не обойтись.',
    'Telegram показывает ответ как обычный текст: не используй Markdown (**, #, таблицы).',
    'Списки оформляй простыми строками с «•» или «1.».',
    'У бота есть свои команды: /weather — погода, /rate — курсы валют, /tasks и /add — задачи,',
    '/calc — калькулятор, /morning — утренняя сводка, /help — все команды.',
    'Если вопрос про это — подскажи нужную команду.',
    'Если не знаешь точного или актуального ответа (новости, цены сегодня) — честно скажи об этом.',
].join(' ');

// Ошибка, которую можно показать пользователю как есть
class AiError extends Error {
    constructor(userMessage, cause) {
        super(userMessage);
        this.name = 'AiError';
        this.cause = cause;
    }
}

let client;

function isConfigured() {
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function getClient() {
    if (!client) {
        // timeout в миллисекундах; SDK сам повторяет запрос при 429/5xx/обрыве сети (2 раза)
        client = new Anthropic({ timeout: 120_000, maxRetries: 2 });
    }
    return client;
}

// Ошибки SDK → понятный текст для пользователя. Порядок: от частного к общему.
function toAiError(error) {
    if (error instanceof Anthropic.AuthenticationError) {
        return new AiError('🔑 ИИ не настроен: неверный ключ API. Сообщи владельцу бота.', error);
    }
    if (error instanceof Anthropic.PermissionDeniedError) {
        return new AiError('🔑 У ключа API нет доступа к этой модели. Сообщи владельцу бота.', error);
    }
    if (error instanceof Anthropic.RateLimitError) {
        return new AiError('⏳ Слишком много запросов к ИИ. Попробуй через минуту.', error);
    }
    if (error instanceof Anthropic.APIConnectionError) {
        // Включает таймаут (APIConnectionTimeoutError — его подкласс)
        return new AiError('📡 Не удалось связаться с ИИ. Попробуй ещё раз чуть позже.', error);
    }
    if (error instanceof Anthropic.APIError && error.status >= 500) {
        return new AiError('😔 ИИ сейчас перегружен. Попробуй ещё раз чуть позже.', error);
    }
    if (error instanceof Anthropic.APIError && error.type === 'billing_error') {
        return new AiError('💳 На счёте API закончились средства. Сообщи владельцу бота.', error);
    }
    return new AiError('😔 Не получилось получить ответ от ИИ. Попробуй ещё раз.', error);
}

// messages — история диалога: [{ role: 'user' | 'assistant', content: 'текст' }, ...],
// последнее сообщение — от пользователя. Возвращает { text, truncated }.
async function ask(messages) {
    if (!isConfigured()) {
        throw new AiError('🤖 ИИ пока не подключён: владельцу бота нужно добавить ANTHROPIC_API_KEY в .env.');
    }

    let response;
    try {
        response = await getClient().beta.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: SYSTEM_PROMPT,
            // Для переписки хватает низкого уровня усилий: ответ быстрее и дешевле
            output_config: { effort: 'low' },
            // Если модель откажется отвечать по соображениям безопасности, API сам
            // повторит запрос на подходящей запасной модели
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            messages,
        });
    } catch (error) {
        throw toAiError(error);
    }

    if (response.stop_reason === 'refusal') {
        throw new AiError('🙅 На этот вопрос я не могу ответить. Попробуй спросить иначе.');
    }

    // В ответе бывают служебные блоки (размышления, переключение модели) — берём только текст
    const text = response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim();

    if (!text) {
        throw new AiError('🤔 ИИ вернул пустой ответ. Попробуй переформулировать вопрос.');
    }
    return { text, truncated: response.stop_reason === 'max_tokens' };
}

module.exports = {
    MODEL,
    AiError,
    isConfigured,
    ask,
    // для тестов: подменить клиент
    _setClient: (value) => {
        client = value;
    },
};
