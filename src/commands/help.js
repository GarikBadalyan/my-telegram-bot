const { mainMenu } = require('../keyboards');

// Текст справки собирается из списка всех команд (commands/index.js),
// поэтому новая команда появится в /help автоматически.
function helpText() {
    // require внутри функции: commands/index.js сам подключает этот файл
    const { commands } = require('./index');
    return [
        '📋 Доступные команды:',
        '',
        ...commands.map((c) => `/${c.command} — ${c.description}`),
        '',
        'Или просто нажми на кнопку ниже 👇',
    ].join('\n');
}

async function showHelp(ctx) {
    await ctx.reply(helpText(), { reply_markup: mainMenu() });
}

module.exports = {
    command: 'help',
    description: 'Список доступных команд',
    handler: showHelp,
    callbacks: {
        help: showHelp,
    },
};
