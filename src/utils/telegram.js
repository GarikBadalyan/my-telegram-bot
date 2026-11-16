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

const TELEGRAM_MESSAGE_LIMIT = 4000; // у Telegram лимит 4096, оставляем запас

// Длинный текст отправляем несколькими сообщениями, не разрывая строки.
// Строку длиннее лимита (без переносов) режем по лимиту.
async function replyLong(ctx, lines) {
    const pieces = [];
    for (const line of lines) {
        for (let i = 0; i < Math.max(line.length, 1); i += TELEGRAM_MESSAGE_LIMIT) {
            pieces.push(line.slice(i, i + TELEGRAM_MESSAGE_LIMIT));
        }
    }
    let chunk = '';
    for (const piece of pieces) {
        if (chunk && chunk.length + piece.length + 1 > TELEGRAM_MESSAGE_LIMIT) {
            await ctx.reply(chunk);
            chunk = '';
        }
        chunk += (chunk ? '\n' : '') + piece;
    }
    if (chunk.trim()) {
        await ctx.reply(chunk);
    }
}

module.exports = { editPressedMessage, commandArgs, replyLong, TELEGRAM_MESSAGE_LIMIT };
