const tasks = require('../services/tasks');
const { taskCommand } = require('../utils/taskCommand');

const USAGE = '/add Купить продукты';

module.exports = {
    command: 'add',
    description: 'Добавить задачу: /add Купить продукты',

    handler: taskCommand(async (ctx, userId, args) => {
        if (!args) {
            await ctx.reply(`✍️ Напиши текст задачи после команды.\n\nПример: ${USAGE}`);
            return;
        }
        const task = tasks.addTask(userId, args);
        await ctx.reply(`✅ Задача #${task.id} добавлена:\n${task.title}\n\nВсе задачи: /tasks`);
    }, USAGE),
};
