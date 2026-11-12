const { InlineKeyboardBuilder } = require('node-telegram-bot-api');
const { editPressedMessage } = require('../utils/telegram');
const { replyWeather } = require('./weather');

const ASK_TEXT = '❓ Показать погоду в Ереване?';

// Кнопки «Да / Нет / Подробнее» под сообщением.
// callback_data с префиксом ask: — чтобы отличать их от кнопок меню.
function askKeyboard() {
    return new InlineKeyboardBuilder()
        .text('✅ Да', 'ask:yes')
        .text('❌ Нет', 'ask:no')
        .row()
        .text('📖 Подробнее', 'ask:more')
        .build();
}

module.exports = {
    command: 'ask',
    description: 'Вопрос с кнопками «Да / Нет / Подробнее»',

    async handler(ctx) {
        await ctx.reply(ASK_TEXT, { reply_markup: askKeyboard() });
    },

    callbacks: {
        async 'ask:yes'(ctx) {
            // Убираем кнопки, чтобы нельзя было ответить дважды
            await editPressedMessage(ctx, `${ASK_TEXT}\n\nТвой ответ: ✅ Да`);
            await replyWeather(ctx);
        },
        async 'ask:no'(ctx) {
            await editPressedMessage(ctx, `${ASK_TEXT}\n\nТвой ответ: ❌ Нет. Хорошо, в другой раз!`);
        },
        async 'ask:more'(ctx) {
            // Добавляем пояснение, но кнопки оставляем — можно ответить дальше
            await editPressedMessage(
                ctx,
                `${ASK_TEXT}\n\n📖 Я покажу температуру, влажность и ветер в Ереване ` +
                    'прямо сейчас (данные Open-Meteo). Нажми «Да» или «Нет».',
                askKeyboard(),
            );
        },
    },
};
