// Все команды бота. Порядок здесь = порядок в /help и в меню команд Telegram.
//
// Каждый файл команды экспортирует объект:
//   command     — имя команды без «/»
//   description — описание для /help и меню Telegram
//   handler     — что делать, когда пользователь отправил команду
//   callbacks   — (необязательно) обработчики нажатий на кнопки, по callback_data
//
// Чтобы добавить новую команду: создай файл в этой папке и допиши его сюда.
const commands = [
    require('./start'),
    require('./help'),
    require('./menu'),
    require('./time'),
    require('./weather'),
    require('./ask'),
    require('./calc'),
    require('./joke'),

    // Менеджер задач
    require('./add'),
    require('./tasks'),
    require('./done'),
    require('./edit'),
    require('./delete'),
    require('./completed'),
];

module.exports = { commands };
