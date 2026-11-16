const { mainMenu } = require('../keyboards');

const ABOUT_TEXT =
    'ℹ️ Я Telegram-бот: отвечаю на вопросы с помощью ИИ — просто напиши мне, ' +
    'а ещё веду задачи, показываю погоду, курсы валют и присылаю утреннюю сводку. Все команды: /help';

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
