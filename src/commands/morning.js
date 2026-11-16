// /morning — включить/выключить утреннюю сводку и посмотреть, как она выглядит.
// Подписка привязана к чату: в личке — для вас, в группе — для всей группы.

const { InlineKeyboardBuilder } = require('node-telegram-bot-api');
const morning = require('../services/morning');
const { editPressedMessage } = require('../utils/telegram');

function statusText(chatId, notice = '') {
    const on = morning.isSubscribed(chatId);
    return [
        ...(notice ? [notice, ''] : []),
        `☀️ Утренняя сводка: ${on ? 'включена ✅' : 'выключена'}`,
        '',
        `Каждый день в ${morning.SEND_TIME_TEXT} (по Еревану) присылаю погоду в Ереване и курс драма.`,
    ].join('\n');
}

function statusKeyboard(chatId) {
    const on = morning.isSubscribed(chatId);
    return new InlineKeyboardBuilder()
        .text(on ? '🔕 Выключить' : '🔔 Включить', on ? 'morning:off' : 'morning:on')
        .text('👀 Показать сейчас', 'morning:preview')
        .build();
}

async function showStatus(ctx) {
    await ctx.reply(statusText(ctx.chatId), { reply_markup: statusKeyboard(ctx.chatId) });
}

async function onButton(ctx, action) {
    const chatId = ctx.chatId;
    if (!chatId) return;

    if (action === 'preview') {
        try {
            await ctx.reply(await morning.buildSummary());
        } catch (error) {
            console.error('Morning preview error:', error);
            await ctx.reply('😔 Не удалось собрать сводку. Попробуй позже.');
        }
        return;
    }

    let notice;
    if (action === 'on') {
        const first = morning.subscribe(chatId);
        notice = `🔔 Готово! Первая сводка — ${first === 'today' ? 'сегодня' : 'завтра'} в ${morning.SEND_TIME_TEXT}.`;
    } else if (action === 'off') {
        morning.unsubscribe(chatId);
        notice = '🔕 Сводка выключена. Включить снова — /morning';
    } else {
        await ctx.reply('Неизвестная кнопка 🤔');
        return;
    }
    await editPressedMessage(ctx, statusText(chatId, notice), statusKeyboard(chatId));
}

module.exports = {
    command: 'morning',
    description: 'Утренняя сводка в 11:00: погода и курс драма',
    handler: showStatus,

    callbacks: {
        morning: (ctx, action) => (action === undefined ? showStatus(ctx) : onButton(ctx, action)),
    },
};
