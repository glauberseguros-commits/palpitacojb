'use strict';

const express = require('express');
const admin = require('firebase-admin');

const router = express.Router();
const db = admin.firestore();

// GET /api/pitaco/results?date=2025-12-29&lottery=PT_RIO
router.get('/results', async (req, res) => {
  try {
    const date = String(req.query.date || '').trim();
    const lottery = String(req.query.lottery || 'PT_RIO').trim();

    if (!date) return res.status(400).json({ ok:false, error:'date obrigatório' });

    const snap = await db.collection('draws')
      .where('date', '==', date)
      .where('lottery_key', '==', lottery)
      .get();

    const draws = [];

    for (const doc of snap.docs) {
      const d = doc.data();

      const prizesSnap = await doc.ref.collection('prizes')
        .orderBy('position', 'asc')
        .get();

      draws.push({
        id: doc.id,
        ...d,
        prizes: prizesSnap.docs.map(p => p.data())
      });
    }

    // Ordenar por horário (string "21:09" funciona bem)
    draws.sort((a,b) => String(a.close_hour).localeCompare(String(b.close_hour)));

    return res.json({ ok:true, date, lottery, draws });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message || 'erro' });
  }
});

module.exports = router;
