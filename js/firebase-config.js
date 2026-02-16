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
  apiKey: "AIzaSyBtIIvENMtLZKuom_8KddxC7t61e8KVR8g",
  authDomain: "first-9c907.firebaseapp.com",
  databaseURL: "https://first-9c907-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "first-9c907",
  storageBucket: "first-9c907.firebasestorage.app",
  messagingSenderId: "453031753417",
  appId: "1:453031753417:web:264a0b375bef867fdf7f18"
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
