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
  };

  let db = null;
  let firebaseReady = false;
  let _onResultsChange = null; // callback for real-time leaderboard
  let _onTestsChange = null;

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

  // ——— Tests ———
  function getTests() {
    const raw = localStorage.getItem(KEYS.TESTS);
    if (!raw) {
      const samples = SampleTests.getAll();
      localStorage.setItem(KEYS.TESTS, JSON.stringify(samples));
      // Push samples to Firebase if online
      if (firebaseReady) {
        samples.forEach(t => db.ref('tests/' + t.id).set(t));
      }
      return samples;
    }
    return JSON.parse(raw);
  }

  function getTest(id) {
    return getTests().find(t => t.id === id) || null;
  }

  function saveTest(test) {
    // Local
    const tests = getTests();
    const idx = tests.findIndex(t => t.id === test.id);
    if (idx >= 0) {
      tests[idx] = test;
    } else {
      tests.push(test);
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
    localStorage.removeItem('ct_admin_password');
    if (firebaseReady) {
      db.ref('tests').remove();
      db.ref('results').remove();
      db.ref('sessions').remove();
    }
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
    getUser, setUser, clearUser,
    getTests, getTest, saveTest, deleteTest,
    getResults, getResultsForTest, saveResult, getUserResults,
    getSessions, saveSession, removeSession, clearSessions,
    clearAllResults, resetAllData,
    generateId,
  };
})();
