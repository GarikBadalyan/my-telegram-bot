
require('dotenv').config();

const { Bot, InlineKeyboardBuilder } = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;

if (!token) {
    throw new Error('BOT_TOKEN is missing in .env file');
}


const bot = new Bot(token);

// Список команд — используется и в /help, и в меню команд Telegram
const COMMANDS = [
    { command: 'start', description: 'Запустить бота' },
    { command: 'help', description: 'Список доступных команд' },
    { command: 'menu', description: 'Показать меню с кнопками' },
    { command: 'time', description: 'Текущее время в Армении' },
    { command: 'weather', description: 'Погода (по умолчанию Ереван): /weather Гюмри' },
];

// Расшифровка кодов погоды WMO, которые возвращает Open-Meteo
const WEATHER_CODES = {
    0: '☀️ Ясно',
    1: '🌤 Преимущественно ясно',
    2: '⛅ Переменная облачность',
    3: '☁️ Пасмурно',
    45: '🌫 Туман',
    48: '🌫 Изморозь',
    51: '🌦 Слабая морось',
    53: '🌦 Морось',
    55: '🌦 Сильная морось',
    56: '🌧 Ледяная морось',
    57: '🌧 Сильная ледяная морось',
    61: '🌧 Небольшой дождь',
    63: '🌧 Дождь',
    65: '🌧 Сильный дождь',
    66: '🌧 Ледяной дождь',
    67: '🌧 Сильный ледяной дождь',
    71: '🌨 Небольшой снег',
    73: '🌨 Снег',
    75: '❄️ Сильный снег',
    77: '🌨 Снежные зёрна',
    80: '🌦 Небольшой ливень',
    81: '🌧 Ливень',
    82: '⛈ Сильный ливень',
    85: '🌨 Снегопад',
    86: '❄️ Сильный снегопад',
    95: '⛈ Гроза',
    96: '⛈ Гроза с градом',
    99: '⛈ Сильная гроза с градом',
};

const DEFAULT_CITY = 'Ереван';

async function fetchJson(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return res.json();
}

// Погода через бесплатный API Open-Meteo (ключ не нужен)
async function getWeather(city = DEFAULT_CITY) {
    const geo = await fetchJson(
        'https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&name=' +
            encodeURIComponent(city),
    );
    const place = geo.results?.[0];
    if (!place) {
        return `🤷 Не нашёл город «${city}». Проверь название.`;
    }

    const forecast = await fetchJson(
        'https://api.open-meteo.com/v1/forecast' +
            `?latitude=${place.latitude}&longitude=${place.longitude}` +
            '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code' +
            '&wind_speed_unit=ms&timezone=auto',
    );
    const c = forecast.current;
    const description = WEATHER_CODES[c.weather_code] || 'Без описания';
    const location = [place.name, place.country].filter(Boolean).join(', ');

    return [
        `📍 ${location}`,
        description,
        `🌡 Температура: ${Math.round(c.temperature_2m)}°C (ощущается как ${Math.round(c.apparent_temperature)}°C)`,
        `💧 Влажность: ${c.relative_humidity_2m}%`,
        `💨 Ветер: ${c.wind_speed_10m.toFixed(1)} м/с`,
    ].join('\n');
}

async function replyWeather(ctx, city) {
    try {
        await ctx.reply(await getWeather(city), { reply_markup: mainMenu() });
    } catch (error) {
        console.error('Weather error:', error);
        await ctx.reply('😔 Не удалось получить погоду. Попробуй позже.');
    }
}

// Текущее время в Ереване (часовой пояс Asia/Yerevan, UTC+4)
function armeniaTime() {
    const now = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Asia/Yerevan',
        dateStyle: 'long',
        timeStyle: 'medium',
    }).format(new Date());
    return `🕒 Сейчас в Армении: ${now}`;
}

const HELP_TEXT = [
    '📋 Доступные команды:',
    '',
    ...COMMANDS.map((c) => `/${c.command} — ${c.description}`),
    '',
    'Или просто нажми на кнопку ниже 👇',
].join('\n');

const ABOUT_TEXT = 'ℹ️ Я простой Telegram-бот: повторяю твои сообщения и отвечаю на команды.';

// Главное меню с интерактивными кнопками
function mainMenu() {
    return new InlineKeyboardBuilder()
        .text('📋 Помощь', 'help')
        .text('ℹ️ О боте', 'about')
        .row()
        .text('🕒 Время', 'time')
        .text('🌤 Погода', 'weather')
        .row()
        .text('👋 Поздороваться', 'hello')
        .build();
}

// Команда /start
bot.command('start', async (ctx) => {
    await ctx.reply('Привет! Я твой первый Telegram-бот! 🤖\nВыбери действие:', {
        reply_markup: mainMenu(),
    });
});

// Команда /help
bot.command('help', async (ctx) => {
    await ctx.reply(HELP_TEXT, { reply_markup: mainMenu() });
});

// Команда /menu
bot.command('menu', async (ctx) => {
    await ctx.reply('Выбери действие:', { reply_markup: mainMenu() });
});

// Команда /time
bot.command('time', async (ctx) => {
    await ctx.reply(armeniaTime());
});

// Команда /weather [город]
bot.command('weather', async (ctx) => {
    // Всё, что после /weather (и после /weather@имя_бота), — название города
    const city = ctx.message?.text?.replace(/^\/weather(@\S+)?/i, '').trim();
    await replyWeather(ctx, city || DEFAULT_CITY);
});

// Обработка нажатий на кнопки
bot.on('callback_query', async (ctx) => {
    const data = ctx.callbackQuery?.data;

    // Убираем «часики» на кнопке
    await ctx.answerCallbackQuery();

    switch (data) {
        case 'help':
            await ctx.reply(HELP_TEXT, { reply_markup: mainMenu() });
            break;
        case 'about':
            await ctx.reply(ABOUT_TEXT, { reply_markup: mainMenu() });
            break;
        case 'time':
            await ctx.reply(armeniaTime(), { reply_markup: mainMenu() });
            break;
        case 'weather':
            await replyWeather(ctx, DEFAULT_CITY);
            break;
        case 'hello': {
            const name = ctx.from?.first_name || 'друг';
            await ctx.reply(`Привет, ${name}! 👋`, { reply_markup: mainMenu() });
            break;
        }
        default:
            await ctx.reply('Неизвестная кнопка 🤔');
    }
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
bot.api.setMyCommands({ commands: COMMANDS }).catch(console.error);

// Запуск бота
bot.startPolling().catch(console.error);
