const { mainMenu } = require('../keyboards');

module.exports = {
    command: 'start',
    description: 'Запустить бота',

    async handler(ctx) {
        await ctx.reply('Привет! Я твой первый Telegram-бот! 🤖\nВыбери действие:', {
            reply_markup: mainMenu(),
        });
    },
};
