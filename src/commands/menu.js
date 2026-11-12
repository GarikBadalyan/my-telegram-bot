const { mainMenu } = require('../keyboards');

const ABOUT_TEXT = 'ℹ️ Я простой Telegram-бот: повторяю твои сообщения и отвечаю на команды.';

module.exports = {
    command: 'menu',
    description: 'Показать меню с кнопками',

    async handler(ctx) {
        await ctx.reply('Выбери действие:', { reply_markup: mainMenu() });
    },

    // Кнопки меню, у которых нет своей команды
    callbacks: {
        async about(ctx) {
            await ctx.reply(ABOUT_TEXT, { reply_markup: mainMenu() });
        },
        async hello(ctx) {
            const name = ctx.from?.first_name || 'друг';
            await ctx.reply(`Привет, ${name}! 👋`, { reply_markup: mainMenu() });
        },
    },
};
