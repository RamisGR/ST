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
  let functionsRef = null;
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

  function _toAnswerEvent(raw, questionIndex) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') {
      return {
        questionIndex,
        answerIndex: raw,
        clientSentAt: null,
        serverReceivedAt: null,
      };
    }
    if (typeof raw !== 'object') return null;
    return {
      questionIndex: raw.questionIndex ?? questionIndex,
      answerIndex: raw.answerIndex,
      clientSentAt: raw.clientSentAt || null,
      serverReceivedAt: raw.serverReceivedAt || null,
    };
  }

  function _computeBattleScoreboardEntry(room, playerId) {
    if (!room || !room.players || !room.players[playerId]) return null;
    const player = room.players[playerId];
    const test = getTest(room.testId);
    const questions = (test && test.questions) || [];
    const answersMap = player.answers || {};
    const answerEvents = Object.keys(answersMap)
      .map((k) => _toAnswerEvent(answersMap[k], Number(k)))
      .filter(e => e && Number.isInteger(e.questionIndex) && Number.isInteger(e.answerIndex) && e.answerIndex >= 0);

    const latestByQuestion = new Map();
    answerEvents.forEach((e) => {
      const prev = latestByQuestion.get(e.questionIndex);
      const eTs = e.serverReceivedAt || 0;
      const pTs = prev ? (prev.serverReceivedAt || 0) : -1;
      if (!prev || eTs >= pTs) latestByQuestion.set(e.questionIndex, e);
    });

    let computedScore = 0;
    latestByQuestion.forEach((e, qIndex) => {
      if (questions[qIndex] && questions[qIndex].correct === e.answerIndex) computedScore++;
    });

    const timestamps = Array.from(latestByQuestion.values())
      .map(e => e.serverReceivedAt)
      .filter(ts => typeof ts === 'number' && ts > 0)
      .sort((a, b) => a - b);

    const startedAt = room.startedAt || player.joinedAt || null;
    const finishedAnswers = latestByQuestion.size;
    const computedFinished = questions.length > 0 && finishedAnswers >= questions.length;
    const endTs = timestamps.length > 0 ? timestamps[timestamps.length - 1] : null;
    const computedTimeSpent = (computedFinished && startedAt && endTs)
      ? Math.max(0, Math.round((endTs - startedAt) / 1000))
      : 0;

    return {
      playerId,
      name: player.name || '',
      group: player.group || '',
      answeredCount: finishedAnswers,
      computedScore,
      computedTimeSpent,
      computedFinished,
      computedFinishedAt: computedFinished ? endTs : null,
      updatedAt: Date.now(),
    };
  }

  function recomputeBattleScoreboard(roomCode, playerId) {
    if (firebaseReady) {
      return db.ref('battles/' + roomCode).once('value').then((snapshot) => {
        const room = snapshot.val();
        const entry = _computeBattleScoreboardEntry(room, playerId);
        if (!entry) return null;
        return db.ref('battles/' + roomCode + '/scoreboard/' + playerId).set(entry).then(() => entry);
      });
    }

    const room = _getBattle(roomCode);
    const entry = _computeBattleScoreboardEntry(room, playerId);
    if (!entry) return null;
    const scoreboard = { ...((room && room.scoreboard) || {}) };
    scoreboard[playerId] = entry;
    _patchBattle(roomCode, { scoreboard });
    return entry;
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
      if (firebase.functions) {
        functionsRef = firebase.functions();
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
      participants: {},
      battleSettings,
    };
    if (firebaseReady) {
      db.ref('battles/' + roomCode).set(battle);
    }
    _setBattle(roomCode, battle);
    return battle;
  }

  function joinBattle(roomCode, playerName, playerGroup) {
    return joinBattleWithToken(roomCode, playerName, playerGroup, null);
  }

  function normalizePlayerName(name) {
    return (name || '').trim().toLocaleLowerCase();
  }

  function generateParticipantToken() {
    const rand = Math.random().toString(36).slice(2, 10);
    return 'pt_' + Date.now().toString(36) + rand;
  }

  function _buildNewPlayer(playerId, playerName, playerGroup, normalizedName) {
    return {
      id: playerId,
      name: playerName,
      nameNormalized: normalizedName,
      group: playerGroup,
      joinedAt: Date.now(),
      currentQuestion: 0,
      answeredCount: 0,
      answers: {},
    };
  }

  function _joinBattleOffline(roomCode, playerName, playerGroup, participantToken) {
    const nameNormalized = normalizePlayerName(playerName);
    if (!nameNormalized) return { ok: false, error: 'NAME_REQUIRED' };

    const room = _getBattle(roomCode);
    if (!room) return { ok: false, error: 'ROOM_NOT_FOUND' };

    room.players = room.players || {};
    room.participants = room.participants || {};

    if (participantToken && room.participants[participantToken]) {
      const resumedPlayerId = room.participants[participantToken].playerId;
      if (room.players[resumedPlayerId]) {
        _setBattle(roomCode, room);
        return { ok: true, token: participantToken, playerId: resumedPlayerId, resumed: true };
      }
    }

    const nameTaken = Object.values(room.players).some((p) => (
      p && normalizePlayerName(p.nameNormalized || p.name) === nameNormalized
    ));
    if (nameTaken) return { ok: false, error: 'NAME_TAKEN' };

    const token = participantToken || generateParticipantToken();
    if (room.participants[token] && room.players[room.participants[token].playerId]) {
      return { ok: true, token, playerId: room.participants[token].playerId, resumed: true };
    }

    const playerId = generateId();
    room.players[playerId] = _buildNewPlayer(playerId, playerName, playerGroup, nameNormalized);
    room.participants[token] = { playerId, nameNormalized, issuedAt: Date.now() };
    _setBattle(roomCode, room);
    return { ok: true, token, playerId, resumed: false };
  }

  function joinBattleWithToken(roomCode, playerName, playerGroup, participantToken) {
    if (!firebaseReady) {
      return Promise.resolve(_joinBattleOffline(roomCode, playerName, playerGroup, participantToken || null));
    }

    const nameNormalized = normalizePlayerName(playerName);
    if (!nameNormalized) return Promise.resolve({ ok: false, error: 'NAME_REQUIRED' });

    const token = participantToken || generateParticipantToken();
    const roomRef = db.ref('battles/' + roomCode);

    return roomRef.transaction((room) => {
      if (!room) return room;

      room.players = room.players || {};
      room.participants = room.participants || {};

      if (room.participants[token]) {
        const resumedPlayerId = room.participants[token].playerId;
        if (room.players[resumedPlayerId]) {
          return room;
        }
      }

      const nameTaken = Object.values(room.players).some((p) => (
        p && normalizePlayerName(p.nameNormalized || p.name) === nameNormalized
      ));
      if (nameTaken) {
        return; // abort: collision policy is strict deny
      }

      const playerId = generateId();
      room.players[playerId] = _buildNewPlayer(playerId, playerName, playerGroup, nameNormalized);
      room.participants[token] = { playerId, nameNormalized, issuedAt: Date.now() };
      return room;
    }).then((result) => {
      if (!result || !result.committed) return { ok: false, error: 'NAME_TAKEN' };
      const room = (result.snapshot && result.snapshot.val()) || {};
      const participants = room.participants || {};
      const entry = participants[token];
      if (!entry || !entry.playerId) return { ok: false, error: 'JOIN_FAILED' };
      const resumed = !!participantToken;
      return { ok: true, token, playerId: entry.playerId, resumed };
    }).catch(() => ({ ok: false, error: 'JOIN_FAILED' }));
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

  function saveBattleAnswer(roomCode, playerId, questionIndex, answerIndex, clientSentAt = Date.now()) {
    const payload = {
      questionIndex,
      answerIndex,
      clientSentAt,
      serverReceivedAt: Date.now(),
    };
    if (firebaseReady) {
      const answerRef = db.ref('battles/' + roomCode + '/players/' + playerId + '/answers/' + questionIndex);
      answerRef.transaction((current) => {
        if (current && typeof current === 'object' && current.serverReceivedAt) return current;
        return {
          questionIndex,
          answerIndex,
          clientSentAt: payload.clientSentAt,
          serverReceivedAt: firebase.database.ServerValue.TIMESTAMP,
        };
      });
    }
    const room = _getBattle(roomCode);
    if (room && room.players && room.players[playerId]) {
      const answers = { ...(room.players[playerId].answers || {}) };
      answers[questionIndex] = payload;
      room.players[playerId] = { ...room.players[playerId], answers };
      _setBattle(roomCode, room);
      recomputeBattleScoreboard(roomCode, playerId);
    }
  }

  async function submitAnswer(roomCode, playerId, questionIndex, answerIndex) {
    if (firebaseReady && functionsRef) {
      const callable = functionsRef.httpsCallable('submitAnswer');
      const response = await callable({
        room: roomCode,
        player: playerId,
        question: questionIndex,
        answer: answerIndex,
      });
      return response && response.data ? response.data : { accepted: true };
    }

    // Offline fallback keeps old local behavior.
    saveBattleAnswer(roomCode, playerId, questionIndex, answerIndex);
    return { accepted: true, offline: true };
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
    createBattle, joinBattle, joinBattleWithToken, normalizePlayerName, updateBattlePlayer,
    saveBattleAnswer, updateBattleState,
    startBattle, finishBattle,
    setBattleHost, advanceBattlePhase,
    onBattleChange, offBattleChange, getBattleOnce, getBattleRef,
    generateRoomCode,
  };
})();
