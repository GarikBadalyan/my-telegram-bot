const { InlineKeyboardBuilder } = require('node-telegram-bot-api');

// Главное меню с интерактивными кнопками.
// Второй аргумент .text() — это callback_data: его бот получит при нажатии.
function mainMenu() {
    return new InlineKeyboardBuilder()
        .text('📝 Мои задачи', 'tasks')
        .row()
        .text('📋 Помощь', 'help')
        .text('ℹ️ О боте', 'about')
        .row()
        .text('🕒 Время', 'time')
        .text('🌤 Погода', 'weather')
        .row()
        .text('😂 Шутка', 'joke')
        .text('👋 Поздороваться', 'hello')
        .build();
}

module.exports = { mainMenu };
