const { mainMenu } = require('../keyboards');

// Текущее время в Ереване (часовой пояс Asia/Yerevan, UTC+4)
function armeniaTime() {
    const now = new Intl.DateTimeFormat('ru-RU', {
        timeZone: 'Asia/Yerevan',
        dateStyle: 'long',
        timeStyle: 'medium',
    }).format(new Date());
    return `🕒 Сейчас в Армении: ${now}`;
}

module.exports = {
    command: 'time',
    description: 'Текущее время в Армении',

    async handler(ctx) {
        await ctx.reply(armeniaTime());
    },

    callbacks: {
        async time(ctx) {
            await ctx.reply(armeniaTime(), { reply_markup: mainMenu() });
        },
    },
};
