// /morning — утренняя сводка: включить/выключить, «каждый день» или «только будни»,
// и посмотреть, как она выглядит.
// Подписка привязана к чату: в личке — для вас, в группе — для всей группы.

const { InlineKeyboardBuilder } = require('node-telegram-bot-api');
const morning = require('../services/morning');
const { editPressedMessage } = require('../utils/telegram');

const scheduleText = (weekdaysOnly) =>
    `${weekdaysOnly ? 'по будням (пн–пт)' : 'каждый день'} в ${morning.SEND_TIME_TEXT} по Еревану`;

function statusText(chatId, notice = '') {
    const on = morning.isSubscribed(chatId);
    const weekdaysOnly = morning.isWeekdaysOnly(chatId);
    return [
        ...(notice ? [notice, ''] : []),
        `☀️ Утренняя сводка: ${on ? 'включена ✅' : 'выключена'}`,
        `🗓 Когда: ${scheduleText(weekdaysOnly)}`,
        ...(on ? [`⏭ Следующая — ${morning.nextDelivery(chatId)} в ${morning.SEND_TIME_TEXT}`] : []),
        '',
        'В сводке — погода в Ереване на сегодня и курс драма.',
    ].join('\n');
}

function statusKeyboard(chatId) {
    const on = morning.isSubscribed(chatId);
    const weekdaysOnly = morning.isWeekdaysOnly(chatId);
    return new InlineKeyboardBuilder()
        .text(on ? '🔕 Выключить' : '🔔 Включить', on ? 'morning:off' : 'morning:on')
        .text('👀 Показать сейчас', 'morning:preview')
        .row()
        .text(
            weekdaysOnly ? '📅 Каждый день' : '📅 Только будни',
            weekdaysOnly ? 'morning:daily' : 'morning:weekdays',
        )
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
        notice = `🔔 Готово! Первая сводка — ${first} в ${morning.SEND_TIME_TEXT}.`;
    } else if (action === 'off') {
        morning.unsubscribe(chatId);
        notice = '🔕 Сводка выключена. Включить снова — /morning';
    } else if (action === 'weekdays' || action === 'daily') {
        morning.setWeekdaysOnly(chatId, action === 'weekdays');
        notice = `🗓 Готово: сводка ${scheduleText(action === 'weekdays')}.`;
    } else {
        await ctx.reply('Неизвестная кнопка 🤔');
        return;
    }
    await editPressedMessage(ctx, statusText(chatId, notice), statusKeyboard(chatId));
}

module.exports = {
    command: 'morning',
    description: 'Утренняя сводка в 11:00 (каждый день или по будням)',
    handler: showStatus,

    callbacks: {
        morning: (ctx, action) => (action === undefined ? showStatus(ctx) : onButton(ctx, action)),
    },
};
