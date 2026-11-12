const { mainMenu } = require('../keyboards');
const { getWeather, DEFAULT_CITY } = require('../services/weather');
const { commandArgs } = require('../utils/telegram');

async function replyWeather(ctx, city = DEFAULT_CITY) {
    try {
        await ctx.reply(await getWeather(city), { reply_markup: mainMenu() });
    } catch (error) {
        console.error('Weather error:', error);
        await ctx.reply('😔 Не удалось получить погоду. Попробуй позже.');
    }
}

module.exports = {
    command: 'weather',
    description: 'Погода (по умолчанию Ереван): /weather Paris',

    // /weather Гюмри — всё после команды считаем названием города
    async handler(ctx) {
        await replyWeather(ctx, commandArgs(ctx) || DEFAULT_CITY);
    },

    callbacks: {
        weather: (ctx) => replyWeather(ctx),
    },

    replyWeather,
};
