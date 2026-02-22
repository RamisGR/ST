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
 * Базовая защита доступа:
 * 1) Включите Firebase Auth и выдавайте Custom Token с claims:
 *    - role: host | teacher | player | observer
 *    - rooms: {"ROOM123": true, ...} — список разрешённых комнат
 * 2) Примените правила из файла `firebase-database.rules.json`.
 *
 * Минимальный fallback, если Auth ещё не внедрён:
 * - генерируйте сервером подписанный room-token и передавайте в URL `?roomToken=`
 *   или в `sessionStorage/localStorage` под ключом `roomAccessToken`;
 * - клиент попробует авторизоваться через signInWithCustomToken(roomToken).
 *
 * ВНИМАНИЕ: не используйте открытые правила `".read": true, ".write": true` в production.
 */
