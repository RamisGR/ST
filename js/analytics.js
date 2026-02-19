const Analytics = (() => {
  function _results() {
    return Storage.getResults() || [];
  }

  function _testsById() {
    const map = {};
    (Storage.getTests() || []).forEach((t) => { map[t.id] = t; });
    return map;
  }

  function getResultsForFolder(folderId) {
    const tests = Storage.getTestsInFolder(folderId);
    const testIds = new Set(tests.map((t) => t.id));
    return _results().filter((r) => testIds.has(r.testId));
  }

  function getFolderStats(folderId) {
    const tests = Storage.getTestsInFolder(folderId);
    const results = getResultsForFolder(folderId);
    const uniqueStudents = new Set(results.map((r) => r.userName)).size;
    const avgScore = results.length ? Math.round(results.reduce((s, r) => s + (r.score || 0), 0) / results.length) : 0;
    return {
      testCount: tests.length,
      resultCount: results.length,
      uniqueStudents,
      avgScore,
    };
  }

  function computeTrend(results) {
    if (!results || results.length < 4) return 'stable';
    const sorted = [...results].sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));
    const mid = Math.floor(sorted.length / 2);
    const first = sorted.slice(0, mid);
    const second = sorted.slice(mid);
    const avg = (arr) => arr.length ? arr.reduce((s, r) => s + (r.score || 0), 0) / arr.length : 0;
    const d = avg(second) - avg(first);
    if (d > 7) return 'improving';
    if (d < -7) return 'declining';
    return 'stable';
  }

  function getStudentProfile(userName) {
    const tests = _testsById();
    const results = _results()
      .filter((r) => r.userName === userName)
      .sort((a, b) => (a.completedAt || 0) - (b.completedAt || 0));

    const timeline = results.map((r) => ({
      at: r.completedAt,
      score: r.score || 0,
      testId: r.testId,
      testTitle: tests[r.testId] ? tests[r.testId].title : r.testId,
      folderId: tests[r.testId] ? (tests[r.testId].folderId || null) : null,
    }));

    const gapsMap = {};
    results.forEach((r) => {
      (r.answers || []).forEach((a) => {
        if (!a || a.isCorrect) return;
        const key = `${r.testId}::${a.questionId}`;
        if (!gapsMap[key]) {
          gapsMap[key] = {
            testId: r.testId,
            testTitle: tests[r.testId] ? tests[r.testId].title : r.testId,
            questionId: a.questionId,
            incorrectCount: 0,
          };
        }
        gapsMap[key].incorrectCount += 1;
      });
    });

    const byTest = {};
    const byFolder = {};
    results.forEach((r) => {
      const testTitle = tests[r.testId] ? tests[r.testId].title : r.testId;
      const folderId = tests[r.testId] ? (tests[r.testId].folderId || '__unfiled__') : '__unfiled__';
      byTest[testTitle] = byTest[testTitle] || { attempts: 0, avgScore: 0, _sum: 0 };
      byTest[testTitle].attempts += 1;
      byTest[testTitle]._sum += r.score || 0;

      byFolder[folderId] = byFolder[folderId] || { attempts: 0, avgScore: 0, _sum: 0 };
      byFolder[folderId].attempts += 1;
      byFolder[folderId]._sum += r.score || 0;
    });

    Object.values(byTest).forEach((v) => { v.avgScore = Math.round(v._sum / v.attempts); delete v._sum; });
    Object.values(byFolder).forEach((v) => { v.avgScore = Math.round(v._sum / v.attempts); delete v._sum; });

    const avgScore = results.length ? Math.round(results.reduce((s, r) => s + (r.score || 0), 0) / results.length) : 0;

    return {
      userName,
      attempts: results.length,
      avgScore,
      trend: computeTrend(results),
      timeline,
      knowledgeGaps: Object.values(gapsMap).sort((a, b) => b.incorrectCount - a.incorrectCount),
      byTest,
      byFolder,
      latestActivityAt: results.length ? results[results.length - 1].completedAt : null,
    };
  }

  function getStrugglingStudents(threshold = 50) {
    const grouped = {};
    _results().forEach((r) => {
      grouped[r.userName] = grouped[r.userName] || [];
      grouped[r.userName].push(r);
    });
    return Object.entries(grouped)
      .map(([name, results]) => {
        const avg = results.reduce((s, r) => s + (r.score || 0), 0) / results.length;
        return {
          userName: name,
          avgScore: Math.round(avg),
          attempts: results.length,
          trend: computeTrend(results),
        };
      })
      .filter((s) => s.avgScore < threshold)
      .sort((a, b) => a.avgScore - b.avgScore);
  }

  function getHardQuestions(folderId) {
    const tests = _testsById();
    const sourceResults = folderId ? getResultsForFolder(folderId) : _results();
    const map = {};

    sourceResults.forEach((r) => {
      (r.answers || []).forEach((a) => {
        if (!a) return;
        const key = `${r.testId}::${a.questionId}`;
        if (!map[key]) {
          map[key] = {
            testId: r.testId,
            testTitle: tests[r.testId] ? tests[r.testId].title : r.testId,
            folderId: tests[r.testId] ? (tests[r.testId].folderId || null) : null,
            questionId: a.questionId,
            attempts: 0,
            wrong: 0,
            selectedDistribution: {},
          };
        }
        map[key].attempts += 1;
        if (!a.isCorrect) map[key].wrong += 1;
        const picked = String(a.selected);
        map[key].selectedDistribution[picked] = (map[key].selectedDistribution[picked] || 0) + 1;
      });
    });

    return Object.values(map)
      .map((q) => ({ ...q, errorRate: q.attempts ? Math.round((q.wrong / q.attempts) * 100) : 0 }))
      .sort((a, b) => b.errorRate - a.errorRate);
  }

  function getScoreDistribution(results) {
    const buckets = [
      { range: '0-20', min: 0, max: 20, count: 0 },
      { range: '20-40', min: 20, max: 40, count: 0 },
      { range: '40-60', min: 40, max: 60, count: 0 },
      { range: '60-80', min: 60, max: 80, count: 0 },
      { range: '80-100', min: 80, max: 101, count: 0 },
    ];
    (results || []).forEach((r) => {
      const score = Math.max(0, Math.min(100, Number(r.score || 0)));
      const bucket = buckets.find((b) => score >= b.min && score < b.max);
      if (bucket) bucket.count += 1;
    });
    return buckets;
  }

  return {
    getResultsForFolder,
    getFolderStats,
    getStudentProfile,
    getStrugglingStudents,
    getHardQuestions,
    computeTrend,
    getScoreDistribution,
  };
})();
