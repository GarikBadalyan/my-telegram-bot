const tasks = require('../services/tasks');
const { taskCommand } = require('../utils/taskCommand');

const USAGE = '/delete 1';

module.exports = {
    command: 'delete',
    description: 'Удалить задачу: /delete 1',

    handler: taskCommand(async (ctx, userId, args) => {
        const task = tasks.deleteTask(userId, args);
        await ctx.reply(`🗑 Задача #${task.id} удалена:\n${task.title}`);
    }, USAGE),
};
