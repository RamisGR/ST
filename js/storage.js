/**
 * Storage module — DB-first persistence.
 *
 * If Firebase is configured → Firebase Realtime DB is the source of truth.
 *   localStorage is used only as a temporary read cache for synchronous UI access.
 * If Firebase is NOT configured → works with localStorage only (offline mode).
 */
const Storage = (() => {
  const KEYS = {
    USER: 'ct_user',
    TESTS: 'ct_tests',
    RESULTS: 'ct_results',
    SESSIONS: 'ct_sessions',
    BATTLES: 'ct_battles',
  };

  let db = null;
  let firebaseReady = false;
  let _onResultsChange = null; // callback for real-time leaderboard
  let _onTestsChange = null;
  let _testsSeededInFirebase = false;
  const _battleListeners = new Map();

  function _getBattlesMap() {
    const raw = localStorage.getItem(KEYS.BATTLES);
    return raw ? JSON.parse(raw) : {};
  }

  function _saveBattlesMap(map) {
    localStorage.setItem(KEYS.BATTLES, JSON.stringify(map));
  }

  function _getBattle(roomCode) {
    const map = _getBattlesMap();
    return map[roomCode] || null;
  }

  function _setBattle(roomCode, battle) {
    const map = _getBattlesMap();
    if (battle) map[roomCode] = battle;
    else delete map[roomCode];
    _saveBattlesMap(map);

    const listeners = _battleListeners.get(roomCode) || [];
    listeners.forEach(cb => cb(map[roomCode] || null));
  }

  function _patchBattle(roomCode, patch) {
    const current = _getBattle(roomCode);
    if (!current) return null;
    const next = { ...current, ...patch };
    _setBattle(roomCode, next);
    return next;
  }

  function _seedDefaultTestsInFirebase() {
    if (!firebaseReady || _testsSeededInFirebase) return;
    _testsSeededInFirebase = true;
    const samples = SampleTests.getAll();
    if (samples.length === 0) return;
    const updates = {};
    samples.forEach(t => { updates['tests/' + t.id] = t; });
    db.ref().update(updates);
  }

  // ——— Firebase Init ———
  function initFirebase() {
    try {
      if (typeof firebase === 'undefined') return;
      if (!FirebaseConfig || !FirebaseConfig.apiKey) return;

      // Don't re-initialize
      if (firebase.apps && firebase.apps.length > 0) {
        db = firebase.database();
      } else {
        firebase.initializeApp(FirebaseConfig);
        db = firebase.database();
      }
      firebaseReady = true;
      console.log('[TestArena] Firebase connected');

      // Set up real-time listeners
      _listenTests();
      _listenResults();
    } catch (e) {
      console.warn('[TestArena] Firebase init failed, using offline mode:', e.message);
      firebaseReady = false;
    }
  }

  // ——— Firebase Real-time Listeners ———
  function _listenTests() {
    if (!firebaseReady) return;
    db.ref('tests').on('value', (snapshot) => {
      const data = snapshot.val();
      const tests = data ? Object.values(data) : [];

      if (!data) {
        _seedDefaultTestsInFirebase();
      }

      localStorage.setItem(KEYS.TESTS, JSON.stringify(tests));
      if (_onTestsChange) _onTestsChange(tests);
    });
  }

  function _listenResults() {
    if (!firebaseReady) return;
    db.ref('results').on('value', (snapshot) => {
      const data = snapshot.val();
      const results = data ? Object.values(data) : [];
      localStorage.setItem(KEYS.RESULTS, JSON.stringify(results));
      if (_onResultsChange) _onResultsChange(results);
    });
  }

  function onResultsChange(callback) {
    _onResultsChange = callback;
  }

  function onTestsChange(callback) {
    _onTestsChange = callback;
  }

  function isOnline() {
    return firebaseReady;
  }

  // ——— User (always local only) ———
  function getUser() {
    const raw = localStorage.getItem(KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  }

  function setUser(user) {
    localStorage.setItem(KEYS.USER, JSON.stringify(user));
  }

  function clearUser() {
    localStorage.removeItem(KEYS.USER);
  }

  function logout() {
    clearUser();
    window.location.href = 'index.html';
  }

  // ——— Tests ———
  function getTests() {
    const raw = localStorage.getItem(KEYS.TESTS);
    if (raw) return JSON.parse(raw);

    if (firebaseReady) {
      // Firebase is authoritative; return temporary empty cache until listener syncs.
      return [];
    }

    // Offline fallback: use bundled sample tests in local cache.
    const samples = SampleTests.getAll();
    localStorage.setItem(KEYS.TESTS, JSON.stringify(samples));
    return samples;
  }

  function getTest(id) {
    return getTests().find(t => t.id === id) || null;
  }

  function saveTest(test) {
    // Temporary local cache update for immediate UI feedback.
    const tests = getTests();
    const idx = tests.findIndex(t => t.id === test.id);
    if (idx >= 0) tests[idx] = test;
    else tests.push(test);
    localStorage.setItem(KEYS.TESTS, JSON.stringify(tests));

    if (firebaseReady) {
      // Authoritative write.
      db.ref('tests/' + test.id).set(test);
    }
  }

  function deleteTest(id) {
    // Temporary local cache update.
    const tests = getTests().filter(t => t.id !== id);
    localStorage.setItem(KEYS.TESTS, JSON.stringify(tests));
    const results = getResults().filter(r => r.testId !== id);
    localStorage.setItem(KEYS.RESULTS, JSON.stringify(results));

    if (firebaseReady) {
      // Authoritative delete.
      db.ref('tests/' + id).remove();
      // Remove related results
      db.ref('results').orderByChild('testId').equalTo(id).once('value', (snapshot) => {
        const updates = {};
        snapshot.forEach(child => { updates[child.key] = null; });
        if (Object.keys(updates).length > 0) {
          db.ref('results').update(updates);
        }
      });
    }
  }

  // ——— Results ———
  function getResults() {
    const raw = localStorage.getItem(KEYS.RESULTS);
    return raw ? JSON.parse(raw) : [];
  }

  function getResultsForTest(testId) {
    return getResults()
      .filter(r => r.testId === testId)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.timeSpent - b.timeSpent;
      });
  }

  function saveResult(result) {
    // Local
    const results = getResults();
    results.push(result);
    localStorage.setItem(KEYS.RESULTS, JSON.stringify(results));

    // Firebase
    if (firebaseReady) {
      db.ref('results/' + result.id).set(result);
    }
  }

  function getUserResults(userName) {
    return getResults().filter(r => r.userName === userName);
  }

  // ——— Live Sessions (who is currently taking a test) ———
  function getSessions() {
    const raw = localStorage.getItem(KEYS.SESSIONS);
    return raw ? JSON.parse(raw) : [];
  }

  function saveSession(session) {
    const sessions = getSessions();
    const idx = sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) {
      sessions[idx] = session;
    } else {
      sessions.push(session);
    }
    localStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));

    if (firebaseReady) {
      db.ref('sessions/' + session.id).set(session);
      // Auto-remove session after disconnect
      db.ref('sessions/' + session.id).onDisconnect().remove();
    }
  }

  function removeSession(sessionId) {
    const sessions = getSessions().filter(s => s.id !== sessionId);
    localStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));

    if (firebaseReady) {
      db.ref('sessions/' + sessionId).remove();
    }
  }

  function onSessionsChange(callback) {
    if (!firebaseReady) return;
    db.ref('sessions').on('value', (snapshot) => {
      const data = snapshot.val();
      const sessions = data ? Object.values(data) : [];
      localStorage.setItem(KEYS.SESSIONS, JSON.stringify(sessions));
      callback(sessions);
    });
  }

  function clearSessions() {
    localStorage.removeItem(KEYS.SESSIONS);
    if (firebaseReady) {
      db.ref('sessions').remove();
    }
  }

  // ——— Admin: clear results ———
  function clearAllResults() {
    localStorage.removeItem(KEYS.RESULTS);
    if (firebaseReady) {
      db.ref('results').remove();
    }
  }

  function resetAllData() {
    localStorage.removeItem(KEYS.TESTS);
    localStorage.removeItem(KEYS.RESULTS);
    localStorage.removeItem(KEYS.SESSIONS);
    localStorage.removeItem(KEYS.BATTLES);
    localStorage.removeItem('ct_admin_password');
    if (firebaseReady) {
      db.ref('tests').remove();
      db.ref('results').remove();
      db.ref('sessions').remove();
      db.ref('battles').remove();
    }
  }

  // ——— Battle Rooms (competitive mode) ———
  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  function createBattle(testId, testTitle, questionsCount, timeLimit, creatorName) {
    const roomCode = generateRoomCode();
    const test = getTest(testId);
    const sourceSettings = (test && test.battleSettings) || {};
    const battleSettings = {
      ...sourceSettings,
      // Battle room must run in per-question competitive flow
      perQuestionMode: true,
      perQuestionTime: sourceSettings.perQuestionTime || 20,
      ratingDuration: sourceSettings.ratingDuration || 4,
      chartType: sourceSettings.chartType || 'vertical-bar',
      ratingTitle: sourceSettings.ratingTitle || 'Распределение ответов',
      showCorrectAnswer: sourceSettings.showCorrectAnswer !== false,
      showPlayerCount: sourceSettings.showPlayerCount !== false,
    };
    const battle = {
      id: roomCode,
      testId,
      testTitle,
      questionsCount,
      timeLimit,
      createdBy: creatorName,
      createdAt: Date.now(),
      status: 'waiting', // legacy
      phase: 'waiting', // waiting | countdown | question | rating | finished
      questionIndex: 0,
      phaseStartedAt: null,
      phaseDurationMs: 0,
      startedAt: null,
      currentQuestion: 0,
      creatorPlayerId: null,
      players: {},
      battleSettings,
    };
    if (firebaseReady) {
      db.ref('battles/' + roomCode).set(battle);
    }
    _setBattle(roomCode, battle);
    return battle;
  }

  function joinBattle(roomCode, playerName, playerGroup) {
    const playerId = generateId();
    const player = {
      id: playerId,
      name: playerName,
      group: playerGroup,
      joinedAt: Date.now(),
      currentQuestion: 0,
      correctCount: 0,
      answeredCount: 0,
      answers: {},
      finished: false,
      finishedAt: null,
      timeSpent: 0,
    };
    if (firebaseReady) {
      db.ref('battles/' + roomCode + '/players/' + playerId).set(player);
    }
    const room = _getBattle(roomCode);
    if (room) {
      room.players = room.players || {};
      room.players[playerId] = player;
      _setBattle(roomCode, room);
    }
    return playerId;
  }

  function updateBattlePlayer(roomCode, playerId, data) {
    if (firebaseReady) {
      db.ref('battles/' + roomCode + '/players/' + playerId).update(data);
    }
    const room = _getBattle(roomCode);
    if (room && room.players && room.players[playerId]) {
      room.players[playerId] = { ...room.players[playerId], ...data };
      _setBattle(roomCode, room);
    }
  }

  function saveBattleAnswer(roomCode, playerId, questionIndex, answerIndex) {
    if (firebaseReady) {
      db.ref('battles/' + roomCode + '/players/' + playerId + '/answers/' + questionIndex).set(answerIndex);
    }
    const room = _getBattle(roomCode);
    if (room && room.players && room.players[playerId]) {
      const answers = { ...(room.players[playerId].answers || {}) };
      answers[questionIndex] = answerIndex;
      room.players[playerId] = { ...room.players[playerId], answers };
      _setBattle(roomCode, room);
    }
  }

  function updateBattleState(roomCode, data) {
    if (firebaseReady) {
      db.ref('battles/' + roomCode).update(data);
    }
    _patchBattle(roomCode, data);
  }

  function setBattleHost(roomCode, playerId) {
    if (!playerId) return;
    const patch = { creatorPlayerId: playerId };
    if (firebaseReady) {
      db.ref('battles/' + roomCode).update(patch);
    }
    _patchBattle(roomCode, patch);
  }

  function startBattle(roomCode, actorPlayerId) {
    return advanceBattlePhase(roomCode, actorPlayerId, true);
  }

  function finishBattle(roomCode) {
    _patchBattle(roomCode, { status: 'finished', phase: 'finished' });
    if (firebaseReady) {
      db.ref('battles/' + roomCode + '/status').set('finished');
    }
  }

  function _computeNextPhaseState(room, forceStart) {
    const now = Date.now();
    const bs = room.battleSettings || {};
    const questionDurationMs = (bs.perQuestionTime || 20) * 1000;
    const ratingDurationMs = (bs.ratingDuration || 4) * 1000;
    const questionsCount = room.questionsCount || 0;
    const phase = room.phase || room.status || 'waiting';
    const qIndex = Number(room.questionIndex || room.currentQuestion || 0);

    if (forceStart && phase === 'waiting') {
      return { phase: 'countdown', status: 'countdown', questionIndex: 0, currentQuestion: 0, phaseStartedAt: now, phaseDurationMs: 4000, startedAt: room.startedAt || now };
    }
    if (phase === 'countdown') {
      return { phase: 'question', status: 'active', questionIndex: 0, currentQuestion: 0, phaseStartedAt: now, phaseDurationMs: questionDurationMs, startedAt: room.startedAt || now };
    }
    if (phase === 'question') {
      return { phase: 'rating', status: 'showing_rating', questionIndex: qIndex, currentQuestion: qIndex, phaseStartedAt: now, phaseDurationMs: ratingDurationMs };
    }
    if (phase === 'rating') {
      if (qIndex < questionsCount - 1) {
        const nextQ = qIndex + 1;
        return { phase: 'question', status: 'active', questionIndex: nextQ, currentQuestion: nextQ, phaseStartedAt: now, phaseDurationMs: questionDurationMs };
      }
      return { phase: 'finished', status: 'finished', phaseStartedAt: now, phaseDurationMs: 0 };
    }
    return null;
  }

  function advanceBattlePhase(roomCode, actorPlayerId, forceStart = false) {
    if (!firebaseReady) {
      const room = _getBattle(roomCode);
      if (!room) return Promise.resolve(false);
      if (!forceStart && room.phase && room.phaseStartedAt && room.phaseDurationMs > 0 && (room.phaseStartedAt + room.phaseDurationMs) > Date.now()) return Promise.resolve(false);
      if (room.creatorPlayerId && room.creatorPlayerId !== actorPlayerId) return Promise.resolve(false);
      const next = _computeNextPhaseState(room, forceStart);
      if (!next) return Promise.resolve(false);
      _patchBattle(roomCode, next);
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      db.ref('battles/' + roomCode).transaction((room) => {
        if (!room) return room;
        if (room.creatorPlayerId && room.creatorPlayerId !== actorPlayerId) return;
        if (!forceStart && room.phaseStartedAt && room.phaseDurationMs > 0 && (room.phaseStartedAt + room.phaseDurationMs) > Date.now()) return;
        const next = _computeNextPhaseState(room, forceStart);
        if (!next) return;
        return { ...room, ...next };
      }, (error, committed) => {
        resolve(!error && committed);
      });
    });
  }

  function onBattleChange(roomCode, callback) {
    const listeners = _battleListeners.get(roomCode) || [];
    listeners.push(callback);
    _battleListeners.set(roomCode, listeners);

    callback(_getBattle(roomCode));

    if (!firebaseReady) return { roomCode, callback, firebaseRef: null };
    const ref = db.ref('battles/' + roomCode);
    ref.on('value', (snapshot) => {
      const data = snapshot.val();
      if (data) {
        _setBattle(roomCode, data);
        return;
      }
      callback(_getBattle(roomCode));
    });
    return { roomCode, callback, firebaseRef: ref };
  }

  function offBattleChange(ref) {
    if (!ref) return;

    const listeners = _battleListeners.get(ref.roomCode) || [];
    _battleListeners.set(ref.roomCode, listeners.filter(cb => cb !== ref.callback));

    if (ref.firebaseRef) ref.firebaseRef.off();
  }

  function getBattleOnce(roomCode, callback) {
    if (!firebaseReady) { callback(_getBattle(roomCode)); return; }
    db.ref('battles/' + roomCode).once('value', (snapshot) => {
      const data = snapshot.val();
      if (data) _setBattle(roomCode, data);
      callback(data || _getBattle(roomCode));
    });
  }

  function getBattleRef(roomCode) {
    if (!firebaseReady) return null;
    return db.ref('battles/' + roomCode);
  }

  // ——— Utility ———
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return {
    initFirebase,
    isOnline,
    onResultsChange,
    onTestsChange,
    onSessionsChange,
    getUser, setUser, clearUser, logout,
    getTests, getTest, saveTest, deleteTest,
    getResults, getResultsForTest, saveResult, getUserResults,
    getSessions, saveSession, removeSession, clearSessions,
    clearAllResults, resetAllData,
    generateId,
    // Battle
    createBattle, joinBattle, updateBattlePlayer,
    saveBattleAnswer, updateBattleState,
    startBattle, finishBattle,
    setBattleHost, advanceBattlePhase,
    onBattleChange, offBattleChange, getBattleOnce, getBattleRef,
    generateRoomCode,
  };
})();
