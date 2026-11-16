const { resetHistory } = require('../services/aiChat');

module.exports = {
    command: 'reset',
    description: 'Начать разговор с ИИ заново',

    async handler(ctx) {
        resetHistory(ctx.chatId);
        await ctx.reply('🧹 Начинаем с чистого листа: предыдущий разговор с ИИ забыт. Задай новый вопрос.');
    },
};
