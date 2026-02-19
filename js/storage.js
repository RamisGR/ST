/**
 * Storage module — dual-mode persistence.
 *
 * If Firebase is configured → writes to both Firebase Realtime DB and localStorage.
 *   Firebase listeners keep localStorage in sync with other clients.
 * If Firebase is NOT configured → works with localStorage only (offline mode).
 *
 * All reads are synchronous (from localStorage cache).
 * All writes are sync (localStorage) + async (Firebase push in background).
 */
const Storage = (() => {
  const KEYS = {
    USER: 'ct_user',
    TESTS: 'ct_tests',
    RESULTS: 'ct_results',
    SESSIONS: 'ct_sessions',
    FOLDERS: 'ct_folders',
    BATTLE_RESULTS: 'ct_battle_results',
  };

  let db = null;
  let firebaseReady = false;
  let _onResultsChange = null; // callback for real-time leaderboard
  let _onTestsChange = null;
  let _onFoldersChange = null;

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
      _listenFolders();
      _listenBattleResults();
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
      if (data) {
        const tests = Object.values(data);
        localStorage.setItem(KEYS.TESTS, JSON.stringify(tests));
        if (_onTestsChange) _onTestsChange(tests);
      }
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

  function _listenFolders() {
    if (!firebaseReady) return;
    db.ref('folders').on('value', (snapshot) => {
      const data = snapshot.val();
      const folders = data ? Object.values(data) : [];
      localStorage.setItem(KEYS.FOLDERS, JSON.stringify(folders));
      if (_onFoldersChange) _onFoldersChange(folders);
    });
  }

  function onFoldersChange(callback) {
    _onFoldersChange = callback;
  }

  function _listenBattleResults() {
    if (!firebaseReady) return;
    db.ref('battleResults').on('value', (snapshot) => {
      const data = snapshot.val();
      const results = data ? Object.values(data) : [];
      localStorage.setItem(KEYS.BATTLE_RESULTS, JSON.stringify(results));
    });
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
    if (!raw) {
      const samples = SampleTests.getAll();
      localStorage.setItem(KEYS.TESTS, JSON.stringify(samples));
      if (firebaseReady) {
        samples.forEach(t => db.ref('tests/' + t.id).set(t));
      }
      return samples;
    }
    // Ensure any new sample tests are added to existing list
    const existing = JSON.parse(raw);
    const samples = SampleTests.getAll();
    let updated = false;
    samples.forEach(s => {
      if (!existing.find(e => e.id === s.id)) {
        existing.push(s);
        updated = true;
        if (firebaseReady) db.ref('tests/' + s.id).set(s);
      }
    });
    if (updated) {
      localStorage.setItem(KEYS.TESTS, JSON.stringify(existing));
    }
    return existing;
  }

  function getTest(id) {
    return getTests().find(t => t.id === id) || null;
  }

  function _normalizeFolderId(folderId) {
    return folderId || null;
  }

  function saveTest(test) {
    // Local
    const tests = getTests();
    const idx = tests.findIndex(t => t.id === test.id);
    if (idx >= 0) {
      tests[idx] = { ...test, folderId: _normalizeFolderId(test.folderId) };
    } else {
      tests.push({ ...test, folderId: _normalizeFolderId(test.folderId) });
    }
    localStorage.setItem(KEYS.TESTS, JSON.stringify(tests));

    // Firebase
    if (firebaseReady) {
      db.ref('tests/' + test.id).set(test);
    }
  }

  function deleteTest(id) {
    // Local
    const tests = getTests().filter(t => t.id !== id);
    localStorage.setItem(KEYS.TESTS, JSON.stringify(tests));
    const results = getResults().filter(r => r.testId !== id);
    localStorage.setItem(KEYS.RESULTS, JSON.stringify(results));

    // Firebase
    if (firebaseReady) {
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

  // ——— Folders ———
  function getFolders() {
    const raw = localStorage.getItem(KEYS.FOLDERS);
    return raw ? JSON.parse(raw) : [];
  }

  function getFolder(id) {
    return getFolders().find((f) => f.id === id) || null;
  }

  function saveFolder(folder) {
    const folders = getFolders();
    const normalized = {
      id: folder.id || ('folder_' + generateId()),
      name: folder.name || 'Folder',
      color: folder.color || '#1368CE',
      sortOrder: Number.isFinite(folder.sortOrder) ? folder.sortOrder : folders.length,
      createdAt: folder.createdAt || Date.now(),
      createdBy: folder.createdBy || '',
    };
    const idx = folders.findIndex((f) => f.id === normalized.id);
    if (idx >= 0) folders[idx] = { ...folders[idx], ...normalized };
    else folders.push(normalized);
    localStorage.setItem(KEYS.FOLDERS, JSON.stringify(folders));
    if (_onFoldersChange) _onFoldersChange(folders);

    if (firebaseReady) db.ref('folders/' + normalized.id).set(normalized);
    return normalized;
  }

  function deleteFolder(id) {
    const folders = getFolders().filter((f) => f.id !== id);
    localStorage.setItem(KEYS.FOLDERS, JSON.stringify(folders));
    const tests = getTests().map((t) => (t.folderId === id ? { ...t, folderId: null } : t));
    localStorage.setItem(KEYS.TESTS, JSON.stringify(tests));
    if (_onFoldersChange) _onFoldersChange(folders);

    if (firebaseReady) {
      db.ref('folders/' + id).remove();
      tests.filter((t) => !t.folderId).forEach((t) => db.ref('tests/' + t.id + '/folderId').set(null));
    }
  }

  function getTestsInFolder(folderId) {
    if (folderId === '__all__') return getTests();
    if (folderId === '__unfiled__' || folderId == null) {
      return getTests().filter((t) => !t.folderId);
    }
    return getTests().filter((t) => t.folderId === folderId);
  }

  function moveTestToFolder(testId, folderId) {
    const test = getTest(testId);
    if (!test) return null;
    const updated = { ...test, folderId: _normalizeFolderId(folderId) };
    saveTest(updated);
    return updated;
  }

  // ——— Battle Results snapshots ———
  function getBattleResults() {
    const raw = localStorage.getItem(KEYS.BATTLE_RESULTS);
    return raw ? JSON.parse(raw) : [];
  }

  function getBattleResultsForTest(testId) {
    return getBattleResults().filter((r) => r.testId === testId);
  }

  function saveBattleResult(result) {
    const results = getBattleResults();
    const normalized = { ...result, id: result.id || ('br_' + generateId()) };
    const idx = results.findIndex((r) => r.id === normalized.id);
    if (idx >= 0) results[idx] = normalized;
    else results.push(normalized);
    localStorage.setItem(KEYS.BATTLE_RESULTS, JSON.stringify(results));
    if (firebaseReady) db.ref('battleResults/' + normalized.id).set(normalized);
    return normalized;
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
    localStorage.removeItem(KEYS.FOLDERS);
    localStorage.removeItem(KEYS.BATTLE_RESULTS);
    localStorage.removeItem('ct_admin_password');
    if (firebaseReady) {
      db.ref('tests').remove();
      db.ref('results').remove();
      db.ref('sessions').remove();
      db.ref('folders').remove();
      db.ref('battleResults').remove();
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
    const battle = {
      id: roomCode,
      testId,
      testTitle,
      questionsCount,
      timeLimit,
      createdBy: creatorName,
      createdAt: Date.now(),
      status: 'waiting', // waiting | countdown | active | showing_rating | finished
      startedAt: null,
      currentQuestion: 0,
      players: {},
      battleSettings: test && test.battleSettings ? test.battleSettings : {
        perQuestionMode: false,
        perQuestionTime: 20,
        ratingDuration: 4,
        chartType: 'vertical-bar',
        ratingTitle: 'Распределение ответов',
        showCorrectAnswer: true,
        showPlayerCount: true,
      },
    };
    if (firebaseReady) {
      db.ref('battles/' + roomCode).set(battle);
    }
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
    return playerId;
  }

  function updateBattlePlayer(roomCode, playerId, data) {
    if (firebaseReady) {
      db.ref('battles/' + roomCode + '/players/' + playerId).update(data);
    }
  }

  function saveBattleAnswer(roomCode, playerId, questionIndex, answerIndex) {
    if (firebaseReady) {
      db.ref('battles/' + roomCode + '/players/' + playerId + '/answers/' + questionIndex).set(answerIndex);
    }
  }

  function updateBattleState(roomCode, data) {
    if (firebaseReady) {
      db.ref('battles/' + roomCode).update(data);
    }
  }

  function startBattle(roomCode) {
    if (firebaseReady) {
      db.ref('battles/' + roomCode).update({
        status: 'countdown',
        startedAt: Date.now(),
      });
      // After 4 seconds, set status to active (3-2-1-GO)
      setTimeout(() => {
        db.ref('battles/' + roomCode + '/status').set('active');
      }, 4000);
    }
  }

  function finishBattle(roomCode) {
    if (firebaseReady) {
      db.ref('battles/' + roomCode + '/status').set('finished');
    }
  }

  function onBattleChange(roomCode, callback) {
    if (!firebaseReady) return null;
    const ref = db.ref('battles/' + roomCode);
    ref.on('value', (snapshot) => {
      const data = snapshot.val();
      callback(data);
    });
    return ref;
  }

  function offBattleChange(ref) {
    if (ref) ref.off();
  }

  function getBattleOnce(roomCode, callback) {
    if (!firebaseReady) { callback(null); return; }
    db.ref('battles/' + roomCode).once('value', (snapshot) => {
      callback(snapshot.val());
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
    onFoldersChange,
    onSessionsChange,
    getUser, setUser, clearUser, logout,
    getTests, getTest, saveTest, deleteTest,
    getFolders, getFolder, saveFolder, deleteFolder,
    getTestsInFolder, moveTestToFolder,
    getResults, getResultsForTest, saveResult, getUserResults,
    getBattleResults, getBattleResultsForTest, saveBattleResult,
    getSessions, saveSession, removeSession, clearSessions,
    clearAllResults, resetAllData,
    generateId,
    // Battle
    createBattle, joinBattle, updateBattlePlayer,
    saveBattleAnswer, updateBattleState,
    startBattle, finishBattle,
    onBattleChange, offBattleChange, getBattleOnce, getBattleRef,
    generateRoomCode,
  };
})();
