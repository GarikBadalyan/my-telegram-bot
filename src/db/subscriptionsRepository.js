// SQL-запросы к таблице morning_subscriptions (подписки на утреннюю сводку).
// Только параметризованные запросы — значения передаются через «?».

const { getDb } = require('./database');

function getSubscription(chatId) {
    const row = getDb()
        .prepare('SELECT chat_id, enabled, last_sent_date FROM morning_subscriptions WHERE chat_id = ?')
        .get(chatId);
    return row ? { ...row, enabled: row.enabled === 1 } : undefined;
}

// Включить или выключить. lastSentDate — чтобы при включении после 11:00
// не прислать сводку за сегодня (первая придёт завтра).
function setSubscription(chatId, enabled, lastSentDate = null) {
    getDb()
        .prepare(
            `INSERT INTO morning_subscriptions (chat_id, enabled, last_sent_date) VALUES (?, ?, ?)
             ON CONFLICT (chat_id) DO UPDATE SET
                 enabled = excluded.enabled,
                 last_sent_date = COALESCE(excluded.last_sent_date, morning_subscriptions.last_sent_date)`,
        )
        .run(chatId, enabled ? 1 : 0, lastSentDate);
}

// Чаты, которым сегодня сводка ещё не ушла
function listDue(today) {
    return getDb()
        .prepare(
            `SELECT chat_id FROM morning_subscriptions
             WHERE enabled = 1 AND (last_sent_date IS NULL OR last_sent_date < ?)
             ORDER BY chat_id`,
        )
        .all(today)
        .map((row) => row.chat_id);
}

function markSent(chatId, today) {
    getDb().prepare('UPDATE morning_subscriptions SET last_sent_date = ? WHERE chat_id = ?').run(today, chatId);
}

module.exports = { getSubscription, setSubscription, listDue, markSent };
