export type Locale = 'ru' | 'uk' | 'en' | 'de' | 'fr'

export type Dict = Record<string, string>

const ru: Dict = {
  'plan.loginHint': 'Войдите в аккаунт (Профиль → Аккаунт), чтобы управлять подпиской, оплатой и поддержкой.',
  'plan.loginBtn': 'Войти в аккаунт',
  'support.loginHint': 'Войдите в аккаунт, чтобы написать в поддержку — в Telegram вход происходит автоматически.',
  'pr.reminders': 'Напоминания о событиях',
  'pr.remindersHint': 'Пришлю сообщение в Telegram за час до события',
  'pr.general': 'Общие',
  'plan.payCardAuto': 'Оплатить картой',
  'support.title': 'Поддержка',
  'support.subtitle': 'Мы ответим в течение суток',
  'support.adminSub': 'Входящие сообщения',
  'support.placeholder': 'Напишите сообщение…',
  'support.send': 'Отправить',
  'support.empty': 'Пока нет обращений',
  'support.hello': 'Здравствуйте! Напишите нам — ответим в течение суток.',
  'pay.thanks': 'Спасибо за поддержку!',
  'pay.activated': 'Подписка активирована. Приятного использования Tempo ⚡',
  'pr.support': 'Поддержка',
  'pr.effects': 'Анимации',
  'pr.on': 'Вкл',
  'pr.off': 'Выкл',
  'g.night': 'Доброй ночи',
  'g.morning': 'Доброе утро',
  'g.day': 'Добрый день',
  'g.evening': 'Добрый вечер',
  'nav.home': 'Главная',
  'nav.ai': 'AI',
  'nav.finance': 'Финансы',
  'nav.calendar': 'Календарь',
  'nav.tasks': 'Задачи',
  'nav.nutrition': 'Еда',
  'nav.profile': 'Профиль',

  'c.today': 'сегодня',
  'c.tomorrow': 'завтра',
  'c.yesterday': 'вчера',
  'c.week': 'Неделя',
  'c.month': 'Месяц',
  'c.day': 'День',
  'c.add': 'Добавить',
  'c.back': 'Назад',
  'c.save': 'Сохранить',
  'c.cancel': 'Отмена',
  'c.delete': 'Удалить',
  'c.edit': 'Изменить',
  'c.close': 'Закрыть',
  'c.confirm': 'Подтвердить',
  'c.all': 'Все',
  'c.search': 'Поиск',
  'c.none': 'нет',
  'c.done': 'Готово',
  'c.retry': 'Повторить',
  'c.estimated': 'оценка',
  'c.of': 'из',
  'c.more': 'ещё',

  'home.capturePh': 'Записать что-нибудь…',
  'home.captureHint': 'Одно сообщение — и AI разложит всё по разделам',
  'home.insight': 'Инсайт дня',
  'home.insightEmpty': 'Нажмите, чтобы получить персональный инсайт по вашим данным',
  'home.refresh': 'Обновить',
  'home.spendToday': 'Расходы за день',
  'home.kcalToday': 'Калории',
  'home.tasksLeft': 'Задачи',
  'home.nextEvent': 'Дальше',
  'home.upcoming': 'Скоро',
  'home.noEvents': 'Событий нет — свободный день',
  'home.pendingTasks': 'Задачи на сегодня',
  'home.noTasks': 'Задач нет. Красиво.',
  'home.weekSpending': 'Расходы за неделю',
  'home.todayNutrition': 'Питание сегодня',
  'home.viewAll': 'Все',
  'home.history': 'История записей',
  'home.processing': 'AI обрабатывает…',

  'ai.title': 'Ассистент',
  'ai.placeholder': 'Спросите или запишите…',
  'ai.usage': 'AI-запросов сегодня',
  'ai.ex1': 'Потратил 18€ на обед',
  'ai.ex2': 'Напомни позвонить Алексею в 18:00',
  'ai.ex3': 'Сколько я потратил на этой неделе?',
  'ai.ex4': 'Съел два яйца и тост',
  'ai.needMore': 'Уточните, пожалуйста',
  'ai.actionsFound': 'AI распознал действия',
  'ai.appliedOk': 'Готово — записал',
  'ai.micUnsupported': 'Голосовой ввод не поддерживается в этом браузере',
  'ai.attach': 'Фото еды',
  'ai.listening': 'Слушаю…',
  'ai.limitReached': 'Дневной лимит AI-запросов исчерпан. Обновите тариф или продолжите завтра.',
  'ai.modeChat': 'Чат',
  'ai.modeAction': 'Действия',
  'ai.tier_fast': 'Быстрая',
  'ai.tier_balanced': 'Баланс',
  'ai.tier_advanced': 'Умная',
  'ai.tierLocked': 'Доступно на Plus/Pro',
  'ai.prefsBtn': 'Стиль',
  'ai.prefDepth': 'Глубина',
  'ai.prefLength': 'Длина',
  'ai.prefStyle': 'Тон',
  'ai.prefBehavior': 'Формат',
  'ai.prefTemp': 'Творческость (температура)',
  'ai.depthFast': 'Быстро',
  'ai.depthBalanced': 'Баланс',
  'ai.depthDeep': 'Глубоко',
  'ai.lenShort': 'Коротко',
  'ai.lenNormal': 'Обычно',
  'ai.lenDetailed': 'Подробно',
  'ai.styFriendly': 'Дружелюбно',
  'ai.styProfessional': 'Деловой',
  'ai.styNeutral': 'Нейтрально',
  'ai.styDirect': 'Прямо',
  'ai.bhvSimple': 'Просто',
  'ai.bhvDetailed': 'Подробно',
  'ai.bhvAnalytical': 'Аналитика',
  'ai.bhvStep': 'Пошагово',
  'ai.stop': 'Стоп',
  'ai.copied': 'Скопировано',
  'ai.retryLast': 'Повторить последний запрос',
  'ai.clear': 'Очистить чат',
  'ai.clearConfirm': 'Удалить всю историю переписки?',
  'ai.downgraded': 'Эта модель доступна на более высоком тарифе — отвечала базовая модель.',
  'ai.fellBack': 'Основная модель была недоступна — ответил запасной вариант.',
  'ai.quota': 'Лимит AI-провайдера исчерпан, попробуйте позже.',
  'ai.timeout': 'Модель не ответила вовремя. Попробуйте ещё раз.',
  'ai.planRequired': 'Эта функция доступна на тарифе Plus или Pro.',
  'plan.promoText': '−€{n} на первый платёж',
  'plan.promoUntil': 'до',
  'plan.firstPayment': 'первый платёж',
  'pr.aiPersonalization': 'Персонализация ИИ',
  'pr.aiPersonalizationHint': 'Стиль ответов настраивается в разделе AI',
  'pr.privacy': 'Конфиденциальность',
  'pr.terms': 'Условия использования',

  'fin.title': 'Финансы',
  'f.currency': 'Валюта',
  'f.name': 'Название',
  'fin.balance': 'Баланс месяца',
  'fin.income': 'Доходы',
  'fin.expense': 'Расходы',
  'fin.byCategory': 'По категориям',
  'fin.lastDays': 'Динамика',
  'fin.budgets': 'Бюджеты',
  'fin.budgetEdit': 'Бюджет категории',
  'fin.spent': 'потрачено',
  'fin.left': 'осталось',
  'fin.noBudget': 'Без лимита',
  'fin.transactions': 'Операции',
  'fin.noTransactions': 'Пока нет операций. Запишите первую через AI или добавьте вручную.',
  'fin.addTx': 'Новая операция',
  'fin.amount': 'Сумма',
  'fin.category': 'Категория',
  'fin.note': 'Заметка',
  'fin.date': 'Дата',
  'fin.searchPh': 'Поиск по операциям…',
  'fin.aiReport': 'AI-отчёт за месяц',
  'fin.aiReportHint': 'Нажмите — AI проанализирует доходы, расходы и категории этого месяца',

  'cat.food': 'Еда',
  'cat.groceries': 'Продукты',
  'cat.transport': 'Транспорт',
  'cat.home': 'Дом',
  'cat.health': 'Здоровье',
  'cat.fun': 'Развлечения',
  'cat.clothes': 'Одежда',
  'cat.education': 'Образование',
  'cat.gifts': 'Подарки',
  'cat.bills': 'Счета',
  'cat.other': 'Другое',
  'cat.salary': 'Зарплата',
  'cat.freelance': 'Фриланс',
  'cat.gift': 'Подарок',
  'cat.invest': 'Инвестиции',

  'cal.title': 'Календарь',
  'cal.addEvent': 'Новое событие',
  'cal.eventTitle': 'Название',
  'cal.time': 'Время',
  'cal.duration': 'Длительность (мин)',
  'cal.remind': 'Напомнить',
  'cal.remindBefore': 'за {min} мин',
  'cal.recurrence': 'Повтор',
  'cal.location': 'Место',
  'cal.noEventsDay': 'На этот день событий нет',
  'cal.todayBtn': 'Сегодня',

  'rec.daily': 'каждый день',
  'rec.weekdays': 'по будням',
  'rec.weekly': 'каждую неделю',
  'rec.monthly': 'каждый месяц',

  'tasks.title': 'Задачи',
  'tasks.addTask': 'Новая задача',
  'tasks.quickPh': 'Добавить задачу…',
  'tasks.overdue': 'Просрочено',
  'tasks.today': 'Сегодня',
  'tasks.upcoming': 'Предстоит',
  'tasks.completed': 'Выполнено',
  'tasks.priority': 'Приоритет',
  'tasks.low': 'низкий',
  'tasks.normal': 'средний',
  'tasks.high': 'высокий',
  'tasks.noTasks': 'Список пуст. Запишите задачи через AI — быстро и удобно.',
  'tasks.noOverdue': 'Просроченных нет',

  'nut.title': 'Питание',
  'nut.todayKcal': 'Сегодня',
  'nut.target': 'цель',
  'nut.protein': 'Белки',
  'nut.carbs': 'Углеводы',
  'nut.fat': 'Жиры',
  'nut.meals': 'Приёмы пищи',
  'nut.noMeals': 'Сегодня ничего не записано. Отправьте фото еды ассистенту.',
  'nut.addMeal': 'Добавить приём',
  'nut.whatAte': 'Что вы съели?',
  'nut.whatAtePh': 'например: 2 яйца, тост и кофе с молоком',
  'nut.estimate': 'Оценить через AI',
  'nut.manualAdd': 'Вручную',
  'nut.itemName': 'Название продукта',
  'nut.customFoods': 'Мои продукты',
  'nut.weekKcal': 'Калории за неделю',
  'nut.estimatedNote': 'Значения — оценка AI, а не точное измерение',
  'nut.photo': 'Фото еды',

  'meal.breakfast': 'Завтрак',
  'meal.lunch': 'Обед',
  'meal.dinner': 'Ужин',
  'meal.snack': 'Перекус',

  'pr.title': 'Профиль',
  'pr.name': 'Имя',
  'pr.language': 'Язык',
  'pr.currency': 'Валюта',
  'pr.aiSettings': 'AI',
  'pr.model': 'Модель',
  'pr.apiKey': 'API-ключ Gemini',
  'pr.apiKeyHint': 'По умолчанию используется встроенный ключ. Можно указать свой — из aistudio.google.com (бесплатно).',
  'pr.apiKeySet': 'Используется свой ключ',
  'pr.usageToday': 'Использовано сегодня',
  'pr.goals': 'Цели',
  'pr.kcalTarget': 'Цель калорий в день',
  'pr.widgets': 'Виджеты главной',
  'pr.data': 'Данные',
'pr.app': 'Приложение',
'pr.appWeb': 'Открыть в браузере',
'pr.appTg': 'Открыть в Telegram',
'pr.appInstall': 'Установить приложение',
'pr.appInstalled': 'Установлено',
'pr.appIosHint': 'На iPhone: Поделиться → На экран «Домой». Работает как обычное приложение.',
  'pr.installHintChrome': 'Если окно не появилось: меню браузера (⋮) → «Установить приложение».',
  'pr.installHintTg': 'В Telegram: меню (⋮) → «Добавить на главный экран».',
  'pr.export': 'Экспорт (JSON)',
  'pr.import': 'Импорт',
  'pr.clearAll': 'Удалить все данные',
  'pr.clearWarn': 'Все записи будут удалены безвозвратно. Точно?',
  'pr.about': 'О Tempo',
  'pr.aboutText': 'Tempo — персональная операционная система с ИИ. Данные хранятся локально на устройстве и синхронизируются с вашим Telegram.',
  'pr.subscription': 'Подписка',
  'pr.plan': 'Тариф',
  'pr.security': 'Безопасность',
  'pr.securityText': 'Записи видны только вам. Ключи не передаются третьим лицам.',

  'nav.planning': 'План',
  'nav.billing': 'Оплата',
  'billing.title': 'Оплата',
  'billing.subtitle': 'Тарифы и способы оплаты',
  'plan.payStars': 'Telegram Stars',
  'plan.payCard': 'Банковская карта',
  'plan.payCardBtn': 'Оплатить картой',
  'plan.cardTitle': 'Перевод на карту',
  'plan.cardNumber': 'Номер карты для перевода',
  'plan.cardAmount': 'К оплате',
  'plan.cardHow': 'Скопируйте номер карты и переведите сумму из вашего банковского приложения. Комиссия за перевод (если есть) оплачивается отправителем.',
  'plan.iPaid': 'Я оплатил',
  'plan.cardSent': 'Заявка отправлена',
  'plan.cardSentNote': 'Спасибо! Перевод получат на проверку — подписку активирует владелец обычно в течение нескольких часов.',
  'plan.cardFail': 'Не удалось отправить заявку — попробуйте позже',
  'plan.cardCopied': 'Номер карты скопирован',
  'plan.cardNote': 'Оплата картой — это перевод из вашего банковского приложения. Нажмите «Оплатить картой», скопируйте номер и переведите сумму, затем подтвердите оплату. Подписку активирует владелец после проверки перевода.',
  'home.balance': 'Баланс',

  'plan.free': 'Free',
  'plan.plus': 'Tempo Plus',
  'plan.pro': 'Tempo Pro',
  'plan.perMonth': '/мес',
  'plan.perYear': '/год',
  'plan.current': 'текущий',
  'plan.annual': 'Годовая оплата — 2 месяца в подарок',
  'plan.monthly': 'Месяц',
  'plan.annualBtn': 'Год',
  'plan.upgrade': 'Подключить за',
  'plan.f1': '10 AI-запросов в день',
  'plan.f2': 'Базовые финансы, задачи, календарь',
  'plan.f3': 'Базовая статистика',
  'plan.p1': '100 AI-запросов в день',
  'plan.p2': 'Голосовой ввод',
  'plan.p3': 'Фото еды для анализа',
  'plan.p4': 'Расширенная статистика',
  'plan.p5': 'Экспорт данных',
  'plan.p6': 'Персональные AI-инсайты',
  'plan.m1': '300 AI-запросов в день',
  'plan.m2': 'Всё из Plus',
  'plan.m3': 'Расширенные AI-отчёты',
  'plan.m4': 'Дополнительная автоматизация',
  'plan.m5': 'Расширенная персонализация',
  'plan.m6': 'Приоритетная обработка',
  'plan.aiLimit': 'AI-запросов в день',
  'plan.expires': 'Действует до',
  'plan.stars': 'оплата Telegram Stars',
  'plan.starsPay': 'Оплатить Telegram Stars',
  'plan.serverOff': 'Платежный сервер недоступен — оплата сейчас невозможна. Попробуйте позже.',
  'plan.history': 'История платежей',
  'plan.noHistory': 'Платежей пока не было',
  'plan.cancel': 'Отключить автопродление',
  'plan.cancelled': 'Автопродление отключено',
  'plan.starsNote': 'Оплата проходит внутри Telegram через Stars. Подписка активируется после подтверждения платежа сервером.',

  'ref.title': 'Приглашай друзей',
  'ref.text': 'Делись ссылкой — за каждого друга, который оплатит Tempo, ты получаешь бонусы.',
  'ref.link': 'Твоя ссылка',
  'ref.copy': 'Скопировать',
  'ref.copied': 'Скопировано',
  'ref.invited': 'Приглашено',
  'ref.paying': 'Оплатили',
  'ref.tier1': 'Первый друг — прогресс пошёл',
  'ref.tier2': '3 оплативших — 1 месяц Tempo Plus',
  'ref.tier3': '5 оплативших — месяц Tempo Pro в подарок',
  'ref.antiAbuse': 'Награды начисляются только после реальной оплаты приглашённым. Регистрации ботов и само-приглашения не засчитываются.',

  'pr.theme': 'Тема',

  'acc.title': 'Аккаунт',
  'acc.text': 'Войдите — и ваши данные и подписка будут доступны с любого сайта и устройства. Оплата и админ-доступ проверяются на сервере.',
  'acc.username': 'Логин',
  'acc.password': 'Пароль (мин. 6 символов)',
  'acc.login': 'Войти',
  'acc.register': 'Создать аккаунт',
  'acc.toRegister': 'Нет аккаунта? Создать',
  'acc.toLogin': 'Уже есть аккаунт? Войти',
  'acc.formError': 'Логин — 3-30 символов (буквы, цифры, _ . -), пароль от 6 символов',
  'acc.invalid': 'Неверный логин или пароль',
  'acc.taken': 'Такой логин уже занят',
  'acc.welcome': 'Вы вошли:',
  'acc.user': 'Пользователь',
  'acc.logout': 'Выйти',
'acc.expired': 'Сессия закончилась — войдите снова',
  'acc.syncText': 'Синхронизируйте данные: сохраните копию на сервере и загрузите её на другом устройстве.',
  'acc.upload': 'Сохранить в облако',
  'acc.download': 'Загрузить из облака',
  'acc.uploadOk': 'Данные сохранены на сервере',
  'acc.downloadOk': 'Данные загружены',
  'acc.noCloudData': 'В облаке пока нет сохранённых данных',
  'acc.serverOff': 'Сервер недоступен, попробуйте позже',
  'acc.grantOk': 'Подписка выдана',
  'acc.grantFail': 'Не удалось — проверьте логин',

  'admin.title': 'Админ-панель',
  'admin.users': 'Аккаунтов',
  'admin.paying': 'Оплачивают',
  'admin.payments': 'Платежей',
  'admin.pendingCard': 'Ждут карту',
  'admin.cardPending': 'перевод на карте — проверьте',
  'admin.grantTitle': 'Выдать подписку',
  'admin.grantUser': 'Логин аккаунта',
  'admin.grant': 'Выдать',
  'admin.grantHint': 'Выдаёт подписку вручную (награды за рефералов, поддержка). Пользователь должен иметь аккаунт.',
  'admin.revoke': 'Отключить',
  'admin.userList': 'Пользователи и платежи',
  'admin.noUsers': 'Пользователей пока нет',
  'admin.referrals': 'Рефералы',
  'pr.themeAuto': 'Системная',
  'pr.themeDark': 'Тёмная',
  'pr.themeLight': 'Светлая',

  'cap.review': 'Проверьте и подтвердите',
  'cap.applyAll': 'Записать',
  'cap.newExpense': 'расход',
  'cap.newIncome': 'доход',
  'cap.newTask': 'задача',
  'cap.newEvent': 'событие',
  'cap.newMeal': 'приём пищи',
  'cap.applied': 'Записано',
  'cap.skippedDup': 'Дубликат — пропущено',

  'err.ai': 'AI недоступен, попробуйте ещё раз',
'ai.serverConfig': 'ИИ на сервере не настроен (нет ключа GEMINI_API_KEY). Добавьте свой ключ в Профиль → Настройки ИИ — и ИИ будет работать напрямую с вашего устройства.',
  'err.network': 'Ошибка сети',
  'err.invalidAmount': 'Некорректная сумма',
  'err.storage': 'Хранилище недоступно — данные не сохранятся',
  'err.parse': 'Не удалось разобрать ответ AI',

  // onboarding
  'on.title': 'Добро пожаловать в Tempo',
  'on.next': 'Далее',
  'on.finish': 'Начать',
  'on.welcomeText': 'Tempo — AI Life OS: финансы, задачи, календарь и питание в одном приложении. Настройте его под себя — это займёт полмининуты.',
  'on.nameLabel': 'Как вас зовут?',
  'on.langLabel': 'Язык интерфейса',
  'on.currencyLabel': 'Основная валюта',
  'on.currencyHint': 'Можно изменить в любой момент в Профиле.',
  'on.kcalLabel': 'Дневная цель по калориям (необязательно)',
  'on.kcalHint': 'Нужно только для отслеживания питания — пропустите, если не нужно.',
  'on.skip': 'Пропустить всё и начать',

  // global search
  'search.placeholder': 'Поиск: расходы, задачи, события, еда…',
  'search.typeMore': 'Введите минимум 2 символа',
  'search.empty': 'Ничего не найдено',
  'search.f_all': 'Всё',
  'search.f_tx': 'Финансы',
  'search.f_task': 'Задачи',
  'search.f_event': 'События',
  'search.f_meal': 'Еда',

  // weekly review
  'home.weeklyReview': 'Итоги недели',
  'weekly.tasksDone': 'задач выполнено',
  'weekly.tasksOpen': 'осталось задач',
  'weekly.spend': 'расходы за неделю',
  'weekly.kcal': 'калорий в среднем в день',
  'weekly.noData': 'Данных за неделю пока нет',

  // account deletion (GDPR)
  'acc.deleteTitle': 'Удалить аккаунт',
  'acc.deleteHint': 'Полное удаление аккаунта и облачных данных',
  'acc.deleteWarn': 'Аккаунт и все облачные данные будут удалены безвозвратно. Финансовые записи сохраняются анонимно для отчётности. Для подтверждения введите пароль.',
  'acc.deleteConfirm': 'Удалить навсегда',
  'acc.deletePassPlaceholder': 'Пароль для подтверждения',
  'acc.deleted': 'Аккаунт удалён',
  'acc.wrongPass': 'Неверный пароль',

  // telegram linking
  'acc.linkTg': 'Связать Telegram',
  'acc.linkedTg': 'Telegram связан с аккаунтом',
  'acc.linkTgFail': 'Не удалось связать Telegram',

  // data
  'pr.exportCsv': 'Экспорт CSV (финансы)'
}


// Other locales load lazily (separate build chunks): only the active language's
// dictionary is fetched, keeping the startup bundle small. `ru` is inlined as
// the default/fallback; every key must exist in it.
const dicts: Partial<Record<Locale, Dict>> = { ru }
const pending: Partial<Record<Locale, Promise<void>>> = {}
const listeners = new Set<() => void>()
let dictVersion = 0

/** Fired when a lazily loaded locale dictionary becomes available. */
export function onLocaleDictLoaded(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

/** For React (useSyncExternalStore): re-render on dictionary arrival. */
export const subscribeDicts = (cb: () => void) => {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
export const getDictVersion = () => dictVersion

/**
 * Make sure the dictionary for `l` is available. Resolves immediately for
 * `ru` (inlined) or an already-loaded locale; otherwise fetches the locale's
 * chunk and notifies listeners (so the UI can re-render in the new language).
 */
export async function ensureLocale(l: string): Promise<void> {
  const loc = l as Locale
  const LAZY: Locale[] = ['uk', 'en', 'de', 'fr']
  if (dicts[loc] || !LAZY.includes(loc)) return
  if (!pending[loc]) {
    pending[loc] = (async () => {
      let d: Dict | null = null
      if (loc === 'uk') d = (await import('./locales/uk')).uk
      else if (loc === 'en') d = (await import('./locales/en')).en
      else if (loc === 'de') d = (await import('./locales/de')).de
      else if (loc === 'fr') d = (await import('./locales/fr')).fr
      if (d) dicts[loc] = d
    })()
  }
  await pending[loc]
  dictVersion++
  for (const cb of listeners) cb()
}

let currentLocale = 'ru'
export function setDefaultLocale(l: string) {
  if (!l) return
  currentLocale = l
  void ensureLocale(l)
}

export function t(key: string, locale?: string, vars?: Record<string, string | number>): string {
  const loc = (locale || currentLocale) as Locale
  const d = dicts[loc] ?? ru
  let s = d[key] ?? ru[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v))
  return s
}

export const WIDGET_LABELS: Record<string, string> = {
  overview: 'nav.home / overview',
  insight: 'home.insight',
  upcoming: 'home.upcoming',
  tasks: 'home.pendingTasks',
  weekSpending: 'home.weekSpending',
  nutrition: 'home.todayNutrition',
  history: 'home.history'
}
