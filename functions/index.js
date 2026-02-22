const admin = require('firebase-admin');
const functions = require('firebase-functions');

admin.initializeApp();

exports.submitAnswer = functions.https.onCall(async (data) => {
  const room = String((data && data.room) || '').trim();
  const player = String((data && data.player) || '').trim();
  const question = Number(data && data.question);
  const answer = Number(data && data.answer);

  if (!room || !player || !Number.isInteger(question) || !Number.isInteger(answer)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid payload');
  }

  const roomRef = admin.database().ref(`battles/${room}`);
  let rejectReason = null;

  const txResult = await roomRef.transaction((battle) => {
    if (!battle) {
      rejectReason = 'room_not_found';
      return;
    }

    if (!battle.players || !battle.players[player]) {
      rejectReason = 'player_not_allowed';
      return;
    }

    const phaseQuestion = Number(battle.currentQuestion || 0);
    if (phaseQuestion !== question) {
      rejectReason = 'wrong_phase';
      return;
    }

    const playerNode = battle.players[player];
    playerNode.answers = playerNode.answers || {};

    const existing = playerNode.answers[question];
    const acceptedAt = existing && typeof existing === 'object' ? existing.acceptedAt : null;
    if (acceptedAt) {
      rejectReason = 'already_accepted';
      return;
    }

    playerNode.answers[question] = {
      value: answer,
      acceptedAt: Date.now(),
    };

    return battle;
  });

  if (!txResult.committed) {
    return { accepted: false, reason: rejectReason || 'conflict' };
  }

  const battle = txResult.snapshot.val();
  return {
    accepted: true,
    acceptedAt: battle.players[player].answers[question].acceptedAt,
  };
});
