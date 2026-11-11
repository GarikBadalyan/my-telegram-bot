
require('dotenv').config();

const { Bot } = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;

if (!token) {
    throw new Error('BOT_TOKEN is missing in .env file');
}

const bot = new Bot(token);

// Команда /start
bot.command('start', async (ctx) => {
    await ctx.reply('Привет! Я твой первый Telegram-бот! 🤖');
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

// Запуск бота
bot.startPolling().catch(console.error);
