const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.database();

function toAnswerEvent(raw, fallbackQuestionIndex) {
  if (raw == null) return null;
  if (typeof raw === 'number') {
    return {
      questionIndex: Number(fallbackQuestionIndex),
      answerIndex: raw,
      serverReceivedAt: null,
    };
  }
  if (typeof raw !== 'object') return null;
  return {
    questionIndex: Number(raw.questionIndex ?? fallbackQuestionIndex),
    answerIndex: Number(raw.answerIndex),
    serverReceivedAt: typeof raw.serverReceivedAt === 'number' ? raw.serverReceivedAt : null,
  };
}

async function computeAndSaveScoreboard(roomCode, playerId) {
  const battleSnap = await db.ref(`battles/${roomCode}`).get();
  const battle = battleSnap.val();
  if (!battle || !battle.players || !battle.players[playerId]) return null;

  const player = battle.players[playerId];
  const testId = battle.testId;
  const testSnap = await db.ref(`tests/${testId}`).get();
  const test = testSnap.val();
  const questions = (test && test.questions) || [];

  const answersMap = player.answers || {};
  const latestByQuestion = new Map();
  Object.entries(answersMap).forEach(([questionIndex, raw]) => {
    const event = toAnswerEvent(raw, questionIndex);
    if (!event || !Number.isInteger(event.answerIndex) || event.answerIndex < 0) return;
    const prev = latestByQuestion.get(event.questionIndex);
    const currTs = event.serverReceivedAt || 0;
    const prevTs = prev ? (prev.serverReceivedAt || 0) : -1;
    if (!prev || currTs >= prevTs) latestByQuestion.set(event.questionIndex, event);
  });

  let computedScore = 0;
  latestByQuestion.forEach((event, qIdx) => {
    if (questions[qIdx] && questions[qIdx].correct === event.answerIndex) computedScore += 1;
  });

  const timestamps = Array.from(latestByQuestion.values())
    .map(e => e.serverReceivedAt)
    .filter(ts => typeof ts === 'number' && ts > 0)
    .sort((a, b) => a - b);

  const computedFinished = questions.length > 0 && latestByQuestion.size >= questions.length;
  const startedAt = battle.startedAt || player.joinedAt || null;
  const finishedAt = computedFinished && timestamps.length ? timestamps[timestamps.length - 1] : null;
  const computedTimeSpent = (computedFinished && startedAt && finishedAt)
    ? Math.max(0, Math.round((finishedAt - startedAt) / 1000))
    : 0;

  const payload = {
    playerId,
    name: player.name || '',
    group: player.group || '',
    answeredCount: latestByQuestion.size,
    computedScore,
    computedTimeSpent,
    computedFinished,
    computedFinishedAt: finishedAt,
    updatedAt: admin.database.ServerValue.TIMESTAMP,
  };

  await db.ref(`battles/${roomCode}/scoreboard/${playerId}`).set(payload);
  return payload;
}

exports.onBattleAnswerWrite = functions.database
  .ref('/battles/{roomCode}/players/{playerId}/answers/{questionIndex}')
  .onWrite(async (change, context) => {
    if (!change.after.exists()) return null;
    const answerRef = change.after.ref;
    const val = change.after.val();
    if (val && typeof val === 'object' && typeof val.serverReceivedAt === 'number') {
      await computeAndSaveScoreboard(context.params.roomCode, context.params.playerId);
      return null;
    }

    await answerRef.transaction((current) => {
      if (current && typeof current === 'object' && current.serverReceivedAt) return current;
      if (typeof val === 'number') {
        return {
          questionIndex: Number(context.params.questionIndex),
          answerIndex: val,
          clientSentAt: null,
          serverReceivedAt: admin.database.ServerValue.TIMESTAMP,
        };
      }
      return {
        questionIndex: Number(val.questionIndex ?? context.params.questionIndex),
        answerIndex: Number(val.answerIndex),
        clientSentAt: val.clientSentAt || null,
        serverReceivedAt: admin.database.ServerValue.TIMESTAMP,
      };
    });

    await computeAndSaveScoreboard(context.params.roomCode, context.params.playerId);
    return null;
  });
