const { InlineKeyboardBuilder } = require('node-telegram-bot-api');
const jokes = require('../data/jokes');

// Случайный номер шутки, не совпадающий с только что показанной
function randomJokeIndex(previous) {
    if (jokes.length < 2) return 0;
    let index;
    do {
        index = Math.floor(Math.random() * jokes.length);
    } while (index === previous);
    return index;
}

// Номер показанной шутки кладём прямо в callback_data кнопки («joke:7»).
// Так при нажатии «Ещё» бот знает, какую шутку не повторять,
// и ничего не нужно хранить в памяти.
function jokeKeyboard(index) {
    return new InlineKeyboardBuilder().text('😂 Ещё шутку', `joke:${index}`).build();
}

async function sendJoke(ctx, previous) {
    const index = randomJokeIndex(previous);
    await ctx.reply(`😂 ${jokes[index]}`, { reply_markup: jokeKeyboard(index) });
}

module.exports = {
    command: 'joke',
    description: 'Случайная шутка',

    handler: (ctx) => sendJoke(ctx),

    callbacks: {
        // Кнопка «Шутка» в меню (callback_data: «joke») и «Ещё шутку» («joke:7»)
        joke: (ctx, arg) => sendJoke(ctx, arg === undefined ? undefined : Number(arg)),
    },
};
