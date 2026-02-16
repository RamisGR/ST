/**
 * Sample tests — loaded on first visit.
 */
const SampleTests = (() => {
  const tests = [
    {
      id: 'demo-js',
      title: 'JavaScript: Основы',
      description: 'Проверьте свои знания основ JavaScript',
      timeLimit: 300, // seconds
      createdAt: Date.now(),
      questions: [
        {
          id: 'q1',
          text: 'Какой результат выражения typeof null?',
          options: ['"null"', '"object"', '"undefined"', '"boolean"'],
          correct: 1,
        },
        {
          id: 'q2',
          text: 'Что вернёт выражение 0.1 + 0.2 === 0.3?',
          options: ['true', 'false', 'TypeError', 'undefined'],
          correct: 1,
        },
        {
          id: 'q3',
          text: 'Какой метод массива НЕ изменяет исходный массив?',
          options: ['push()', 'splice()', 'map()', 'sort()'],
          correct: 2,
        },
        {
          id: 'q4',
          text: 'Что такое замыкание (closure)?',
          options: [
            'Способ наследования объектов',
            'Функция, имеющая доступ к переменным внешней функции',
            'Метод закрытия соединения',
            'Блокировка переменной от изменения'
          ],
          correct: 1,
        },
        {
          id: 'q5',
          text: 'Какое ключевое слово создаёт блочную область видимости?',
          options: ['var', 'let', 'function', 'global'],
          correct: 1,
        },
        {
          id: 'q6',
          text: 'Что вернёт выражение [] + []?',
          options: ['[]', '""', 'undefined', 'NaN'],
          correct: 1,
        },
        {
          id: 'q7',
          text: 'Какой метод используется для преобразования JSON-строки в объект?',
          options: ['JSON.stringify()', 'JSON.parse()', 'JSON.decode()', 'JSON.toObject()'],
          correct: 1,
        },
        {
          id: 'q8',
          text: 'Что делает оператор ===?',
          options: [
            'Присваивает значение',
            'Сравнивает значения с приведением типов',
            'Сравнивает значения без приведения типов',
            'Проверяет наличие свойства'
          ],
          correct: 2,
        },
        {
          id: 'q9',
          text: 'Какое значение имеет this в стрелочной функции?',
          options: [
            'undefined',
            'window/global',
            'Наследуется из внешнего контекста',
            'Зависит от способа вызова'
          ],
          correct: 2,
        },
        {
          id: 'q10',
          text: 'Что такое Promise?',
          options: [
            'Синхронная операция',
            'Объект для работы с DOM',
            'Объект, представляющий результат асинхронной операции',
            'Способ объявления переменных'
          ],
          correct: 2,
        },
      ],
    },
    {
      id: 'demo-html',
      title: 'HTML & CSS: Основы',
      description: 'Тест по основам вёрстки веб-страниц',
      timeLimit: 240,
      createdAt: Date.now() - 100000,
      questions: [
        {
          id: 'h1',
          text: 'Какой тег используется для создания гиперссылки?',
          options: ['<link>', '<a>', '<href>', '<url>'],
          correct: 1,
        },
        {
          id: 'h2',
          text: 'Какое CSS-свойство делает элемент невидимым, но сохраняет его место?',
          options: ['display: none', 'visibility: hidden', 'opacity: 0', 'И visibility: hidden, и opacity: 0'],
          correct: 3,
        },
        {
          id: 'h3',
          text: 'Что означает аббревиатура CSS?',
          options: [
            'Creative Style Sheets',
            'Cascading Style Sheets',
            'Computer Style Sheets',
            'Colorful Style Sheets'
          ],
          correct: 1,
        },
        {
          id: 'h4',
          text: 'Какой HTML-элемент имеет наивысший уровень заголовка?',
          options: ['<h6>', '<h1>', '<head>', '<header>'],
          correct: 1,
        },
        {
          id: 'h5',
          text: 'Какое значение position позволяет элементу оставаться на месте при прокрутке?',
          options: ['relative', 'absolute', 'fixed', 'static'],
          correct: 2,
        },
        {
          id: 'h6',
          text: 'Какой CSS-селектор имеет наибольшую специфичность?',
          options: ['Элемент (p)', 'Класс (.class)', 'ID (#id)', 'Универсальный (*)'],
          correct: 2,
        },
        {
          id: 'h7',
          text: 'Какой тег создаёт нумерованный список?',
          options: ['<ul>', '<ol>', '<li>', '<list>'],
          correct: 1,
        },
        {
          id: 'h8',
          text: 'Что делает свойство flexbox justify-content?',
          options: [
            'Выравнивает элементы по вертикали',
            'Выравнивает элементы по горизонтали (главной оси)',
            'Задаёт направление flex-контейнера',
            'Определяет перенос элементов'
          ],
          correct: 1,
        },
      ],
    },
    {
      id: 'demo-python',
      title: 'Python: Основы',
      description: 'Базовые знания языка Python',
      timeLimit: 360,
      createdAt: Date.now() - 200000,
      questions: [
        {
          id: 'p1',
          text: 'Какой тип данных является неизменяемым (immutable)?',
          options: ['list', 'dict', 'set', 'tuple'],
          correct: 3,
        },
        {
          id: 'p2',
          text: 'Что вернёт выражение len("Hello")?',
          options: ['4', '5', '6', 'Error'],
          correct: 1,
        },
        {
          id: 'p3',
          text: 'Какой метод добавляет элемент в конец списка?',
          options: ['add()', 'append()', 'insert()', 'push()'],
          correct: 1,
        },
        {
          id: 'p4',
          text: 'Что делает оператор // в Python?',
          options: ['Комментарий', 'Обычное деление', 'Целочисленное деление', 'Возведение в степень'],
          correct: 2,
        },
        {
          id: 'p5',
          text: 'Как создать виртуальное окружение в Python 3?',
          options: ['pip venv create', 'python -m venv myenv', 'virtualenv --create', 'python --venv new'],
          correct: 1,
        },
        {
          id: 'p6',
          text: 'Что такое list comprehension?',
          options: [
            'Метод сортировки списка',
            'Способ создания списка с помощью краткой записи',
            'Функция для объединения списков',
            'Оператор сравнения списков'
          ],
          correct: 1,
        },
        {
          id: 'p7',
          text: 'Какое ключевое слово используется для обработки исключений?',
          options: ['catch', 'except', 'handle', 'error'],
          correct: 1,
        },
        {
          id: 'p8',
          text: 'Что возвращает функция range(3)?',
          options: ['[0, 1, 2, 3]', '[1, 2, 3]', '[0, 1, 2]', '(0, 1, 2)'],
          correct: 2,
        },
        {
          id: 'p9',
          text: 'Как объявить декоратор в Python?',
          options: [
            'С помощью @',
            'С помощью #',
            'С помощью &',
            'С помощью $'
          ],
          correct: 0,
        },
      ],
    },
  ];

  return {
    getAll() { return JSON.parse(JSON.stringify(tests)); },
  };
})();
