// Тесты ИИ-ответов. Настоящий API не вызывается — клиент подменён, ключ не нужен.

const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const sdk = require('@anthropic-ai/sdk');

const Anthropic = sdk.default ?? sdk;
const ai = require('../src/services/ai');
const aiChat = require('../src/services/aiChat');

// Поддельный клиент: запоминает запросы, отвечает тем, что вернёт respond(params)
function fakeClient(respond) {
    const calls = [];
    return {
        calls,
        beta: {
            messages: {
                create: async (params) => {
                    calls.push(JSON.parse(JSON.stringify(params)));
                    return respond(params, calls.length);
                },
            },
        },
    };
}
const textResponse = (text, extra = {}) => ({
    stop_reason: 'end_turn',
    content: [{ type: 'thinking', thinking: '' }, { type: 'text', text }],
    ...extra,
});
// Ошибка нужного класса SDK (instanceof работает так же, как у настоящей)
function sdkError(Cls, props = {}) {
    return Object.assign(Object.create(Cls.prototype), { message: 'fake', ...props });
}

function fakeCtx({ userId = 7, text } = {}) {
    const replies = [];
    const actions = [];
    return {
        replies,
        actions,
        chatId: userId,
        chat: { id: userId, type: 'private' },
        from: { id: userId },
        message: { text },
        reply: async (t) => replies.push(t),
        api: { sendChatAction: async (p) => actions.push(p.action) },
    };
}

const savedEnv = { ...process.env };
let quietError;
beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    delete process.env.AI_ALLOWED_USERS;
    delete process.env.AI_HOURLY_LIMIT;
    aiChat._reset();
    quietError = console.error;
    console.error = () => {};
});
afterEach(() => {
    process.env = { ...savedEnv };
    console.error = quietError;
    ai._setClient(undefined);
});

// ---------- Запрос к API ----------

test('ИИ: правильные параметры запроса и только текст в ответе', async () => {
    const client = fakeClient(() => ({
        stop_reason: 'end_turn',
        content: [
            { type: 'thinking', thinking: '' },
            { type: 'text', text: 'Привет! ' },
            { type: 'text', text: 'Чем помочь?' },
        ],
    }));
    ai._setClient(client);

    const { text, truncated } = await ai.ask([{ role: 'user', content: 'Привет' }]);
    assert.equal(text, 'Привет! Чем помочь?');
    assert.equal(truncated, false);

    const [p] = client.calls;
    assert.equal(p.model, 'claude-opus-5-5');
    assert.equal(p.max_tokens, 16000);
    assert.deepEqual(p.output_config, { effort: 'low' });
    assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
    assert.equal(p.fallbacks, 'default');
    assert.match(p.system, /не используй Markdown/);
    assert.deepEqual(p.messages, [{ role: 'user', content: 'Привет' }]);
    assert.equal(p.thinking, undefined, 'thinking не передаём — на этой модели он всегда включён');
    assert.equal(p.temperature, undefined);
});

test('ИИ: отказ, пустой ответ и обрезанный ответ', async () => {
    ai._setClient(fakeClient(() => ({ stop_reason: 'refusal', content: [] })));
    await assert.rejects(ai.ask([{ role: 'user', content: 'x' }]), (e) => e instanceof ai.AiError && /не могу ответить/.test(e.message));

    ai._setClient(fakeClient(() => ({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }] })));
    await assert.rejects(ai.ask([{ role: 'user', content: 'x' }]), /пустой ответ/);

    ai._setClient(fakeClient(() => textResponse('длинный…', { stop_reason: 'max_tokens' })));
    assert.equal((await ai.ask([{ role: 'user', content: 'x' }])).truncated, true);
});

test('ИИ: ошибки API превращаются в понятные сообщения', async () => {
    const cases = [
        [sdkError(Anthropic.AuthenticationError, { status: 401 }), /неверный ключ/],
        [sdkError(Anthropic.PermissionDeniedError, { status: 403 }), /нет доступа/],
        [sdkError(Anthropic.RateLimitError, { status: 429 }), /Слишком много запросов/],
        [sdkError(Anthropic.APIConnectionTimeoutError), /Не удалось связаться/],
        [sdkError(Anthropic.APIConnectionError), /Не удалось связаться/],
        [sdkError(Anthropic.InternalServerError, { status: 529 }), /перегружен/],
        [sdkError(Anthropic.APIError, { status: 402, type: 'billing_error' }), /закончились средства/],
        [new Error('что-то странное'), /Не получилось получить ответ/],
    ];
    for (const [error, pattern] of cases) {
        ai._setClient(fakeClient(() => {
            throw error;
        }));
        await assert.rejects(ai.ask([{ role: 'user', content: 'x' }]), (e) => e instanceof ai.AiError && pattern.test(e.message));
    }
});

test('ИИ: без ключа — не ходим в API, а честно говорим', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const client = fakeClient(() => textResponse('не должно случиться'));
    ai._setClient(client);
    const ctx = fakeCtx({ text: 'Привет' });
    await aiChat.handleMessage(ctx, 'Привет');
    assert.match(ctx.replies[0], /ANTHROPIC_API_KEY/);
    assert.equal(client.calls.length, 0);
});

// ---------- Диалог ----------

test('диалог: бот помнит разговор и отвечает в чат', async () => {
    const client = fakeClient((p, n) => textResponse(n === 1 ? 'Приятно познакомиться, Гарик!' : 'Тебя зовут Гарик.'));
    ai._setClient(client);
    const ctx = fakeCtx();

    await aiChat.handleMessage(ctx, 'Меня зовут Гарик');
    await aiChat.handleMessage(ctx, 'Как меня зовут?');

    assert.deepEqual(ctx.replies, ['Приятно познакомиться, Гарик!', 'Тебя зовут Гарик.']);
    assert.deepEqual(client.calls[1].messages, [
        { role: 'user', content: 'Меня зовут Гарик' },
        { role: 'assistant', content: 'Приятно познакомиться, Гарик!' },
        { role: 'user', content: 'Как меня зовут?' },
    ]);
    assert.ok(ctx.actions.includes('typing'), 'показывали «печатает…»');
});

test('диалог: у разных людей — разные разговоры', async () => {
    const client = fakeClient(() => textResponse('ок'));
    ai._setClient(client);
    await aiChat.handleMessage(fakeCtx({ userId: 1 }), 'секрет первого');
    await aiChat.handleMessage(fakeCtx({ userId: 2 }), 'вопрос второго');
    assert.deepEqual(client.calls[1].messages, [{ role: 'user', content: 'вопрос второго' }]);
});

test('диалог: история обрезается и всегда начинается с вопроса', async () => {
    const client = fakeClient(() => textResponse('ответ'));
    ai._setClient(client);
    const ctx = fakeCtx();
    for (let i = 1; i <= 15; i++) await aiChat.handleMessage(ctx, `вопрос ${i}`);

    const sent = client.calls.at(-1).messages;
    assert.equal(sent.length, aiChat.MAX_HISTORY_MESSAGES - 1); // 9 пар + новый вопрос
    assert.equal(sent[0].role, 'user');
    assert.equal(sent.at(-1).content, 'вопрос 15');
    assert.equal(aiChat._history(ctx.chatId).length, aiChat.MAX_HISTORY_MESSAGES);
});

test('диалог: неудачный вопрос не остаётся в истории; /reset всё забывает', async () => {
    let fail = true;
    const client = fakeClient(() => {
        if (fail) throw sdkError(Anthropic.RateLimitError, { status: 429 });
        return textResponse('ответ');
    });
    ai._setClient(client);
    const ctx = fakeCtx();

    await aiChat.handleMessage(ctx, 'первый');
    assert.match(ctx.replies[0], /Слишком много запросов/);
    assert.deepEqual(aiChat._history(ctx.chatId), []);

    fail = false;
    await aiChat.handleMessage(ctx, 'второй');
    assert.deepEqual(client.calls.at(-1).messages, [{ role: 'user', content: 'второй' }]);

    const reset = require('../src/commands/reset');
    await reset.handler(ctx);
    assert.match(ctx.replies.at(-1), /чистого листа/);
    await aiChat.handleMessage(ctx, 'третий');
    assert.deepEqual(client.calls.at(-1).messages, [{ role: 'user', content: 'третий' }]);
});

test('диалог: два быстрых сообщения обрабатываются по очереди', async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const client = fakeClient(async (p, n) => {
        if (n === 1) await gate; // первый ответ «думает» долго
        return textResponse(`ответ ${n}`);
    });
    ai._setClient(client);
    const ctx = fakeCtx();

    const first = aiChat.handleMessage(ctx, 'один');
    const second = aiChat.handleMessage(ctx, 'два');
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(client.calls.length, 1, 'второй вопрос ждёт ответа на первый');
    release();
    await Promise.all([first, second]);

    assert.deepEqual(ctx.replies, ['ответ 1', 'ответ 2']);
    assert.deepEqual(client.calls[1].messages.map((m) => m.content), ['один', 'ответ 1', 'два']);
});

test('доступ: список разрешённых, лимит в час, длинный вопрос', async () => {
    const client = fakeClient(() => textResponse('ок'));
    ai._setClient(client);

    process.env.AI_ALLOWED_USERS = '7, 8';
    const stranger = fakeCtx({ userId: 99 });
    await aiChat.handleMessage(stranger, 'привет');
    assert.match(stranger.replies[0], /только владельцу/);
    assert.equal(client.calls.length, 0);

    process.env.AI_HOURLY_LIMIT = '2';
    const owner = fakeCtx({ userId: 7 });
    for (let i = 0; i < 3; i++) await aiChat.handleMessage(owner, `q${i}`);
    assert.equal(client.calls.length, 2);
    assert.match(owner.replies.at(-1), /Лимит — 2 вопросов в час/);

    const other = fakeCtx({ userId: 8 });
    await aiChat.handleMessage(other, 'а'.repeat(4001));
    assert.match(other.replies[0], /Слишком длинный вопрос/);
    assert.equal(client.calls.length, 2);
});

test('длинный ответ делится на сообщения до 4096 символов', async () => {
    const long = Array.from({ length: 60 }, (_, i) => `Строка ${i} `.padEnd(150, 'я')).join('\n') + '\n' + 'ж'.repeat(9000);
    ai._setClient(fakeClient(() => textResponse(long)));
    const ctx = fakeCtx();
    await aiChat.handleMessage(ctx, 'расскажи подробно');
    assert.ok(ctx.replies.length > 1);
    for (const r of ctx.replies) assert.ok(r.length <= 4096, `сообщение ${r.length} символов`);
    assert.equal(ctx.replies.join('\n').replace(/\n/g, ''), long.replace(/\n/g, ''), 'ничего не потеряно');
});
