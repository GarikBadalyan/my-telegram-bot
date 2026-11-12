const tasks = require('../services/tasks');
const { taskCommand, formatTask, replyLong } = require('../utils/taskCommand');

module.exports = {
    command: 'completed',
    description: 'Выполненные задачи',

    handler: taskCommand(async (ctx, userId) => {
        const { tasks: list, total } = tasks.listCompleted(userId);
        if (list.length === 0) {
            await ctx.reply('Пока нет выполненных задач. Отметить: /done 1');
            return;
        }
        const header =
            total > list.length
                ? `✅ Выполненные задачи (последние ${list.length} из ${total}):`
                : `✅ Выполненные задачи (${total}):`;
        await replyLong(ctx, [header, '', ...list.map(formatTask)]);
    }),
};
