const tasks = require('../services/tasks');
const { taskCommand } = require('../utils/taskCommand');

const USAGE = '/edit 1 Купить молоко';

module.exports = {
    command: 'edit',
    description: 'Изменить текст задачи: /edit 1 Купить молоко',

    handler: taskCommand(async (ctx, userId, args) => {
        // «1 Купить молоко» → номер «1» и новый текст «Купить молоко»
        const [, rawId = '', rawTitle = ''] = args.match(/^(\S*)\s*([\s\S]*)$/);
        if (!rawId) {
            await ctx.reply(`✍️ Укажи номер задачи и новый текст.\n\nПример: ${USAGE}`);
            return;
        }
        const { oldTitle, task } = tasks.editTask(userId, rawId, rawTitle);
        await ctx.reply(`✏️ Задача #${task.id} изменена:\nбыло: ${oldTitle}\nстало: ${task.title}`);
    }, USAGE),
};
