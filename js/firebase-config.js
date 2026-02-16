/**
 * Firebase Configuration
 * =====================
 * Чтобы включить мультиплеер (общий рейтинг, соревнование 30 человек):
 *
 * 1. Зайдите на https://console.firebase.google.com/
 * 2. Создайте новый проект (или используйте существующий)
 * 3. Перейдите в "Build" → "Realtime Database" → "Create Database"
 *    - Выберите регион (europe-west1 для минимальной задержки из РФ)
 *    - Выберите "Start in test mode" (потом закроете правилами)
 * 4. Перейдите в "Project Settings" (шестерёнка) → "General"
 *    → прокрутите вниз до "Your apps" → нажмите "</>" (Web)
 *    → введите имя приложения → "Register app"
 * 5. Скопируйте значения из firebaseConfig ниже:
 */

const FirebaseConfig = {
  // ====== ВСТАВЬТЕ СВОИ ДАННЫЕ СЮДА ======
  apiKey: "",
  authDomain: "",
  databaseURL: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
  // ========================================
};

/**
 * Правила безопасности для Realtime Database (вставить в консоли Firebase):
 *
 * {
 *   "rules": {
 *     "tests": {
 *       ".read": true,
 *       ".write": "auth != null"
 *     },
 *     "results": {
 *       ".read": true,
 *       ".write": true,
 *       ".indexOn": ["testId", "userName", "score"]
 *     },
 *     "sessions": {
 *       ".read": true,
 *       ".write": true
 *     }
 *   }
 * }
 *
 * Для тестового режима (открытый доступ на 30 дней):
 * {
 *   "rules": {
 *     ".read": true,
 *     ".write": true
 *   }
 * }
 */
