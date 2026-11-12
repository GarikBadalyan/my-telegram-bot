// Тесты менеджера задач. Запуск: npm test
// Используют временную базу в памяти — настоящий файл storage/tasks.db не трогается.

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const { openDatabase, closeDatabase, getDb } = require('../src/db/database');
const tasks = require('../src/services/tasks');
const { commands } = require('../src/commands');

const ALICE = 111111;
const BOB = 222222;

before(() => openDatabase(':memory:'));
after(() => closeDatabase());
beforeEach(() => getDb().exec('DELETE FROM tasks'));

// Ожидаем ошибку для пользователя (TaskError) с текстом, содержащим pattern
function assertTaskError(fn, pattern) {
    assert.throws(fn, (error) => error instanceof tasks.TaskError && pattern.test(error.message));
}

// ---------- Бизнес-логика ----------

test('добавление и список активных задач', () => {
    const t = tasks.addTask(ALICE, '  Купить   продукты  ');
    assert.equal(t.title, 'Купить продукты'); // лишние пробелы убраны
    assert.equal(t.completed, false);
    assert.equal(t.user_id, ALICE);
    assert.match(t.created_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.deepEqual(tasks.listActive(ALICE).map((x) => x.title), ['Купить продукты']);
});

test('выполнение задачи переносит её в выполненные', () => {
    const t = tasks.addTask(ALICE, 'Задача');
    tasks.completeTask(ALICE, String(t.id));
    assert.equal(tasks.listActive(ALICE).length, 0);
    assert.deepEqual(tasks.listCompleted(ALICE).tasks.map((x) => x.id), [t.id]);
    assertTaskError(() => tasks.completeTask(ALICE, String(t.id)), /уже выполнена/);
});

test('редактирование и удаление', () => {
    const t = tasks.addTask(ALICE, 'Купить продукты');
    const { oldTitle, task } = tasks.editTask(ALICE, String(t.id), 'Купить молоко');
    assert.equal(oldTitle, 'Купить продукты');
    assert.equal(task.title, 'Купить молоко');
    assert.equal(tasks.listActive(ALICE)[0].title, 'Купить молоко');

    tasks.deleteTask(ALICE, String(t.id));
    assert.equal(tasks.listActive(ALICE).length, 0);
    assertTaskError(() => tasks.deleteTask(ALICE, String(t.id)), /не найдена/);
});

test('пользователь не видит и не может менять чужие задачи', () => {
    const aliceTask = tasks.addTask(ALICE, 'Секрет Алисы');
    const id = String(aliceTask.id);

    assert.equal(tasks.listActive(BOB).length, 0);
    assertTaskError(() => tasks.completeTask(BOB, id), /не найдена/);
    assertTaskError(() => tasks.editTask(BOB, id, 'взлом'), /не найдена/);
    assertTaskError(() => tasks.deleteTask(BOB, id), /не найдена/);

    // Задача Алисы осталась нетронутой
    const [still] = tasks.listActive(ALICE);
    assert.equal(still.title, 'Секрет Алисы');
    assert.equal(still.completed, false);

    tasks.completeTask(ALICE, id);
    assert.equal(tasks.listCompleted(BOB).total, 0);
});

test('некорректные ID отклоняются', () => {
    for (const bad of ['', '   ', 'abc', '-1', '0', '1.5', '1e3', '0x10', '12abc', '99999999999999999999']) {
        assertTaskError(() => tasks.parseTaskId(bad), /./);
    }
    assert.equal(tasks.parseTaskId(' 42 '), 42);
    assertTaskError(() => tasks.completeTask(ALICE, '999'), /#999 не найдена/);
});

test('некорректный текст задачи отклоняется', () => {
    assertTaskError(() => tasks.addTask(ALICE, ''), /пустым/);
    assertTaskError(() => tasks.addTask(ALICE, ' \n\t '), /пустым/);
    assertTaskError(() => tasks.addTask(ALICE, 'а'.repeat(tasks.MAX_TITLE_LENGTH + 1)), /длинный/);
    assert.ok(tasks.addTask(ALICE, '😀'.repeat(tasks.MAX_TITLE_LENGTH))); // эмодзи считаются как 1 символ
    assert.equal(tasks.addTask(ALICE, 'строка 1\nстрока 2').title, 'строка 1 строка 2');
});

test('SQL-инъекция сохраняется как обычный текст', () => {
    const evil = "x'); DROP TABLE tasks; --";
    assert.equal(tasks.addTask(ALICE, evil).title, evil);
    assertTaskError(() => tasks.deleteTask(ALICE, '1 OR 1=1'), /не номер/);
    assert.equal(tasks.listActive(ALICE).length, 1); // таблица на месте
});

test('лимит активных задач', () => {
    for (let i = 0; i < tasks.MAX_ACTIVE_TASKS; i++) tasks.addTask(ALICE, `Задача ${i}`);
    assertTaskError(() => tasks.addTask(ALICE, 'лишняя'), /максимум/);
    assert.ok(tasks.addTask(BOB, 'у Боба свой лимит'));
});

test('ID удалённой задачи не переиспользуется', () => {
    const first = tasks.addTask(ALICE, 'первая');
    tasks.deleteTask(ALICE, String(first.id));
    const second = tasks.addTask(ALICE, 'вторая');
    assert.ok(second.id > first.id);
});

// ---------- Команды Telegram (с заглушкой вместо Telegram) ----------

const handlers = Object.fromEntries(commands.map((c) => [c.command, c.handler]));
const callbackHandlers = Object.assign({}, ...commands.map((c) => c.callbacks));

// Последнее отправленное или изменённое сообщение: { text, keyboard }
let last;
const buttons = () => (last.keyboard?.inline_keyboard ?? []).flat();
const button = (label) => {
    const b = buttons().find((x) => x.text.startsWith(label));
    assert.ok(b, `нет кнопки «${label}» среди: ${buttons().map((x) => x.text).join(', ')}`);
    return b.callback_data;
};

function fakeCtx(userId, chatType, extra) {
    const replies = [];
    const ctx = {
        chat: { id: userId, type: chatType },
        from: { id: userId, first_name: 'Test' },
        reply: async (text, other) => {
            replies.push(text);
            last = { text, keyboard: other?.reply_markup };
        },
        api: {
            editMessageText: async ({ text, reply_markup }) => {
                replies.push(text);
                last = { text, keyboard: reply_markup };
            },
        },
        ...extra,
    };
    return { ctx, replies };
}

async function send(text, { userId = ALICE, chatType = 'private' } = {}) {
    const { ctx, replies } = fakeCtx(userId, chatType, { message: { text } });
    await handlers[text.slice(1).split(/[\s@]/)[0]](ctx);
    return replies.join('\n---\n');
}

// Нажатие кнопки: та же маршрутизация, что в index.js («task:done:5:0» → «task» + «done:5:0»)
async function press(data, { userId = ALICE, chatType = 'private' } = {}) {
    const { ctx, replies } = fakeCtx(userId, chatType, {
        callbackQuery: { data, message: { message_id: 1, chat: { id: userId, type: chatType } } },
    });
    const colon = data.indexOf(':');
    const key = colon === -1 ? data : data.slice(0, colon);
    const arg = colon === -1 ? undefined : data.slice(colon + 1);
    await (callbackHandlers[data] ? callbackHandlers[data](ctx) : callbackHandlers[key](ctx, arg));
    return replies.join('\n---\n');
}

test('команды: полный сценарий', async () => {
    assert.match(await send('/add Купить продукты'), /Задача #\d+ добавлена/);
    const id = tasks.listActive(ALICE)[0].id;

    assert.match(await send('/tasks'), new RegExp(`#${id} — Купить продукты`));
    assert.match(await send(`/edit ${id} Купить молоко`), /было: Купить продукты\nстало: Купить молоко/);
    assert.match(await send(`/done ${id}`), /выполнена/);
    assert.match(await send('/tasks'), /Активных задач нет/);
    assert.match(await send('/completed'), new RegExp(`✅ #${id} — Купить молоко`));
    assert.match(await send(`/delete ${id}`), /удалена/);
    assert.match(await send('/completed'), /Пока нет выполненных/);
});

test('команды: подсказки при неправильном вводе', async () => {
    assert.match(await send('/add'), /Напиши текст задачи/);
    assert.match(await send('/done'), /Укажи номер задачи[\s\S]*Пример: \/done 1/);
    assert.match(await send('/done abc'), /не номер задачи/);
    assert.match(await send('/delete 5'), /#5 не найдена/);
    assert.match(await send('/edit'), /Укажи номер задачи и новый текст/);
    assert.match(await send('/edit 1'), /не может быть пустым|не найдена/);
    assert.match(await send('/edit abc текст'), /не номер задачи/);
});

test('команды: чужие задачи через команды недоступны', async () => {
    await send('/add Задача Алисы');
    const id = tasks.listActive(ALICE)[0].id;
    assert.match(await send('/tasks', { userId: BOB }), /Активных задач нет/);
    assert.match(await send(`/done ${id}`, { userId: BOB }), /не найдена/);
    assert.match(await send(`/edit ${id} взлом`, { userId: BOB }), /не найдена/);
    assert.match(await send(`/delete ${id}`, { userId: BOB }), /не найдена/);
    assert.equal(tasks.listActive(ALICE)[0].title, 'Задача Алисы');
});

test('команды: в группе задачи недоступны', async () => {
    assert.match(await send('/tasks', { chatType: 'group' }), /личные сообщения/);
    assert.match(await send('/add тест', { chatType: 'supergroup' }), /личные сообщения/);
    assert.equal(tasks.listActive(ALICE).length, 0);
});

// ---------- Кнопки под задачами ----------

test('кнопки: «📝 Мои задачи» в меню и кнопки под каждой задачей', async () => {
    const { mainMenu } = require('../src/keyboards');
    const menuButton = mainMenu().inline_keyboard.flat().find((b) => b.text === '📝 Мои задачи');
    assert.equal(menuButton.callback_data, 'tasks');

    const a = tasks.addTask(ALICE, 'Первая');
    const b = tasks.addTask(ALICE, 'Вторая');
    await press('tasks'); // нажали «📝 Мои задачи»
    assert.match(last.text, /Активные задачи \(2\)/);
    assert.equal(button(`✅ Готово #${a.id}`), `task:done:${a.id}:0`);
    assert.equal(button(`🗑 Удалить #${b.id}`), `task:del:${b.id}:0`);

    const viaCommand = await send('/tasks');
    assert.match(viaCommand, /#\d+ — Первая/);
});

test('кнопки: «✅ Готово» выполняет задачу и обновляет список', async () => {
    const a = tasks.addTask(ALICE, 'Первая');
    tasks.addTask(ALICE, 'Вторая');
    await send('/tasks');
    await press(button(`✅ Готово #${a.id}`));
    assert.match(last.text, new RegExp(`^🎉 Задача #${a.id} выполнена: Первая`));
    assert.match(last.text, /Активные задачи \(1\)/);
    assert.ok(!buttons().some((x) => x.text.includes(`#${a.id}`)), 'кнопки выполненной задачи исчезли');
    assert.equal(tasks.listCompleted(ALICE).total, 1);
});

test('кнопки: «🗑 Удалить» сначала переспрашивает, «Отмена» ничего не удаляет', async () => {
    const a = tasks.addTask(ALICE, 'Не трогать');
    await send('/tasks');

    await press(button(`🗑 Удалить #${a.id}`));
    assert.match(last.text, new RegExp(`Удалить задачу #${a.id}\\?\\n\\nНе трогать`));
    assert.equal(tasks.listActive(ALICE).length, 1, 'до подтверждения задача на месте');

    await press(button('↩️ Отмена'));
    assert.match(last.text, /Активные задачи \(1\)/);
    assert.equal(tasks.listActive(ALICE).length, 1);

    await press(button(`🗑 Удалить #${a.id}`));
    await press(button('🗑 Да, удалить'));
    assert.match(last.text, new RegExp(`🗑 Задача #${a.id} удалена: Не трогать`));
    assert.match(last.text, /Активных задач нет/);
    assert.equal(last.keyboard, undefined, 'кнопки убраны');
    assert.equal(tasks.listActive(ALICE).length, 0);
});

test('кнопки: страницы ◀️ ▶️ и не больше 100 кнопок', async () => {
    for (let i = 1; i <= tasks.MAX_ACTIVE_TASKS; i++) tasks.addTask(ALICE, `${i} `.padEnd(190, 'я'));
    await send('/tasks');
    assert.match(last.text, /стр\. 1\/20/);
    assert.ok(last.text.length <= 4096);
    assert.ok(buttons().length <= 100);
    assert.ok(!buttons().some((x) => x.text === '◀️'), 'на первой странице нет «назад»');

    await press(button('▶️'));
    assert.match(last.text, /стр\. 2\/20/);
    await press('task:page:19');
    assert.ok(!buttons().some((x) => x.text === '▶️'), 'на последней странице нет «вперёд»');

    // Выполняем все 5 задач последней страницы — она исчезает, показываем предыдущую
    for (const t of tasks.listActive(ALICE).slice(-5)) await press(`task:done:${t.id}:19`);
    assert.match(last.text, /стр\. 19\/19/);

    assert.equal(await press('task:noop'), ''); // счётчик страниц ничего не делает
    await press('task:page:abc'); // мусор в номере страницы → первая страница
    assert.match(last.text, /стр\. 1\/19/);
});

test('кнопки: подделанная кнопка с чужой задачей ничего не меняет', async () => {
    const secret = tasks.addTask(ALICE, 'Секрет Алисы');
    for (const data of [`task:done:${secret.id}:0`, `task:del:${secret.id}:0`, `task:delyes:${secret.id}:0`]) {
        await press(data, { userId: BOB });
        assert.match(last.text, new RegExp(`⚠️ Задача #${secret.id} не найдена`));
        assert.ok(!last.text.includes('Секрет'), 'текст чужой задачи не показан');
    }
    const [still] = tasks.listActive(ALICE);
    assert.equal(still.title, 'Секрет Алисы');
    assert.equal(still.completed, false);
});

test('кнопки: старая кнопка и мусор в callback_data обрабатываются спокойно', async () => {
    const a = tasks.addTask(ALICE, 'Задача');
    tasks.deleteTask(ALICE, String(a.id)); // удалили командой, а кнопка под старым списком осталась
    await press(`task:done:${a.id}:0`);
    assert.match(last.text, /не найдена/);

    for (const junk of ['task:done:abc:0', 'task:done::0', 'task:delyes:-1:0', 'task:hack:1:0', 'task:']) {
        await press(junk);
        assert.match(last.text, /⚠️/, junk);
    }
});

test('кнопки: в группе не работают', async () => {
    const a = tasks.addTask(ALICE, 'Задача');
    assert.match(await press(`task:done:${a.id}:0`, { chatType: 'group' }), /личные сообщения/);
    assert.match(await press('tasks', { chatType: 'group' }), /личные сообщения/);
    assert.equal(tasks.listActive(ALICE).length, 1);
});
