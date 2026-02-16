/**
 * Storage module — handles all data persistence.
 * Uses localStorage by default. Can be swapped with Firebase.
 */
const Storage = (() => {
  const KEYS = {
    USER: 'ct_user',
    TESTS: 'ct_tests',
    RESULTS: 'ct_results',
    SESSIONS: 'ct_sessions',
  };

  // ——— User ———
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
      // Initialize with sample tests
      const samples = SampleTests.getAll();
      localStorage.setItem(KEYS.TESTS, JSON.stringify(samples));
      return samples;
    }
    return JSON.parse(raw);
  }

  function getTest(id) {
    return getTests().find(t => t.id === id) || null;
  }

  function saveTest(test) {
    const tests = getTests();
    const idx = tests.findIndex(t => t.id === test.id);
    if (idx >= 0) {
      tests[idx] = test;
    } else {
      tests.push(test);
    }
    localStorage.setItem(KEYS.TESTS, JSON.stringify(tests));
  }

  function deleteTest(id) {
    const tests = getTests().filter(t => t.id !== id);
    localStorage.setItem(KEYS.TESTS, JSON.stringify(tests));
    // Also delete related results
    const results = getResults().filter(r => r.testId !== id);
    localStorage.setItem(KEYS.RESULTS, JSON.stringify(results));
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
    const results = getResults();
    results.push(result);
    localStorage.setItem(KEYS.RESULTS, JSON.stringify(results));
  }

  function getUserResults(userName) {
    return getResults().filter(r => r.userName === userName);
  }

  // ——— Sessions (active test sessions for leaderboard) ———
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
  }

  function clearSessions() {
    localStorage.removeItem(KEYS.SESSIONS);
  }

  // ——— Utility ———
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  return {
    getUser, setUser, clearUser,
    getTests, getTest, saveTest, deleteTest,
    getResults, getResultsForTest, saveResult, getUserResults,
    getSessions, saveSession, clearSessions,
    generateId,
  };
})();
