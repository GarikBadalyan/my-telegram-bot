// /weather [город] — погода сейчас + кнопки «Завтра» и «5 дней».
//
// callback_data кнопок: wx:<режим>:<ID города в Open-Meteo>, например «wx:tomorrow:2988507».
// Храним ID, а не название: название может не влезть в лимит Telegram (64 байта).

const { InlineKeyboardBuilder } = require('node-telegram-bot-api');
const weather = require('../services/weather');
const { commandArgs, editPressedMessage } = require('../utils/telegram');

const MAX_CITY_LENGTH = 100;

const BUTTONS = {
    now: '🌡 Сейчас',
    tomorrow: '🌅 Завтра',
    days: `📅 ${weather.FORECAST_DAYS} дней`,
};

// Кнопки остальных режимов (текущий не показываем)
function weatherKeyboard(placeId, currentMode) {
    const keyboard = new InlineKeyboardBuilder();
    for (const mode of weather.MODES) {
        if (mode !== currentMode) keyboard.text(BUTTONS[mode], `wx:${mode}:${placeId}`);
    }
    return keyboard.build();
}

async function replyWeather(ctx, city = weather.DEFAULT_CITY) {
    if (city.length > MAX_CITY_LENGTH) {
        await ctx.reply(`⚠️ Слишком длинное название города (максимум ${MAX_CITY_LENGTH} символов).`);
        return;
    }
    try {
        const place = await weather.findPlace(city);
        if (!place) {
            await ctx.reply(`🤷 Не нашёл город «${city}». Проверь название.`);
            return;
        }
        await ctx.reply(await weather.getWeatherText(place, 'now'), {
            reply_markup: weatherKeyboard(place.id, 'now'),
        });
    } catch (error) {
        console.error('Weather error:', error);
        await ctx.reply('😔 Не удалось получить погоду. Попробуй позже.');
    }
}

// Нажатие «Сейчас» / «Завтра» / «5 дней»: меняем то же сообщение
async function onWeatherButton(ctx, arg = '') {
    const [mode, placeId] = arg.split(':');
    if (!weather.MODES.includes(mode)) {
        await ctx.reply('Неизвестная кнопка 🤔');
        return;
    }
    try {
        const place = await weather.getPlace(placeId);
        if (!place) {
            await ctx.reply('🤷 Не нашёл этот город. Попробуй снова: /weather Paris');
            return;
        }
        const text = await weather.getWeatherText(place, mode);
        await editPressedMessage(ctx, text, weatherKeyboard(place.id, mode));
    } catch (error) {
        console.error('Weather error:', error);
        await ctx.reply('😔 Не удалось получить погоду. Попробуй позже.');
    }
}

module.exports = {
    command: 'weather',
    description: 'Погода и прогноз на 5 дней: /weather Paris',

    // /weather Гюмри — всё после команды считаем названием города
    async handler(ctx) {
        await replyWeather(ctx, commandArgs(ctx) || weather.DEFAULT_CITY);
    },

    callbacks: {
        weather: (ctx) => replyWeather(ctx), // кнопка «🌤 Погода» в главном меню
        wx: onWeatherButton, // кнопки «Сейчас» / «Завтра» / «5 дней»
    },

    replyWeather,
};
