const tasks = require('../services/tasks');
const { taskCommand } = require('../utils/taskCommand');

const USAGE = '/done 1';

module.exports = {
    command: 'done',
    description: 'Отметить задачу выполненной: /done 1',

    handler: taskCommand(async (ctx, userId, args) => {
        const task = tasks.completeTask(userId, args);
        await ctx.reply(`🎉 Задача #${task.id} выполнена:\n${task.title}\n\nВыполненные: /completed`);
    }, USAGE),
};
