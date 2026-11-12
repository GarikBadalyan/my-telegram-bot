// Меняет текст сообщения, к которому привязаны нажатые кнопки
async function editPressedMessage(ctx, text, replyMarkup) {
    const msg = ctx.callbackQuery?.message;
    if (!msg) return;
    try {
        await ctx.api.editMessageText({
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            text,
            reply_markup: replyMarkup,
        });
    } catch (error) {
        // Повторное нажатие той же кнопки: текст не изменился — это не ошибка
        if (!String(error?.message).includes('message is not modified')) {
            throw error;
        }
    }
}

// Текст после команды: «/weather Paris» → «Paris», «/calc@my_bot 2+2» → «2+2»
function commandArgs(ctx) {
    const text = ctx.message?.text || '';
    return text.replace(/^\/\S+/, '').trim();
}

module.exports = { editPressedMessage, commandArgs };
