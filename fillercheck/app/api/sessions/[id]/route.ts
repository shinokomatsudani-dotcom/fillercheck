// UC-03 / UC-04 / UC-05
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { calcRate } from '@/lib/analyzer';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id, 10);
  const db = getDb();

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as {
    id: number; filename: string; uploaded_at: string;
    meeting_result: string | null; total_filler_count: number;
    char_count: number; speakers: string;
  } | undefined;

  if (!session) return NextResponse.json({ error: '商談が見つかりません' }, { status: 404 });

  const speakers: string[] = JSON.parse(session.speakers || '[]');

  // フィラーワード種類別カウント
  const counts = db.prepare(
    'SELECT word, count FROM filler_counts WHERE session_id = ? ORDER BY count DESC'
  ).all(sessionId) as { word: string; count: number }[];

  // 発言箇所
  const occurrences = db.prepare(
    'SELECT word, position, context, occurrence_index, speaker FROM filler_occurrences WHERE session_id = ? ORDER BY position ASC'
  ).all(sessionId) as { word: string; position: number; context: string; occurrence_index: number; speaker: string | null }[];

  // 話者別フィラーカウント
  const speakerCountRows = db.prepare(
    'SELECT speaker, word, count FROM speaker_filler_counts WHERE session_id = ?'
  ).all(sessionId) as { speaker: string; word: string; count: number }[];

  const speakerCounts: Record<string, { word: string; count: number }[]> = {};
  for (const row of speakerCountRows) {
    if (!speakerCounts[row.speaker]) speakerCounts[row.speaker] = [];
    speakerCounts[row.speaker].push({ word: row.word, count: row.count });
  }
  for (const spk of Object.keys(speakerCounts)) {
    speakerCounts[spk].sort((a, b) => b.count - a.count);
  }

  // 話者別文字数
  const charCountRows = db.prepare(
    'SELECT speaker, char_count FROM speaker_char_counts WHERE session_id = ?'
  ).all(sessionId) as { speaker: string; char_count: number }[];

  const speakerCharCounts: Record<string, number> = {};
  for (const r of charCountRows) speakerCharCounts[r.speaker] = r.char_count;

  // 話者別正規化レート
  const speakerRates: Record<string, number> = {};
  for (const spk of speakers) {
    const fillers = (speakerCounts[spk] || []).reduce((s, c) => s + c.count, 0);
    speakerRates[spk] = calcRate(fillers, speakerCharCounts[spk] || 0);
  }

  // 前回比較（UC-05）: meeting_atが取れる場合はそれで比較、なければuploaded_atで比較
  const currentSession = db.prepare(
    'SELECT COALESCE(meeting_at, uploaded_at) as sort_at FROM sessions WHERE id = ?'
  ).get(sessionId) as { sort_at: string } | undefined;

  const prevSession = currentSession ? db.prepare(
    `SELECT id, total_filler_count, char_count, COALESCE(meeting_at, uploaded_at) as meeting_date
     FROM sessions
     WHERE COALESCE(meeting_at, uploaded_at) < ? AND id != ?
     ORDER BY COALESCE(meeting_at, uploaded_at) DESC LIMIT 1`
  ).get(currentSession.sort_at, sessionId) as { id: number; total_filler_count: number; char_count: number; meeting_date: string } | undefined : undefined;

  let prevComparison = null;
  if (prevSession) {
    const prevCounts = db.prepare(
      'SELECT word, count FROM filler_counts WHERE session_id = ?'
    ).all(prevSession.id) as { word: string; count: number }[];
    const prevCountMap: Record<string, number> = {};
    for (const c of prevCounts) prevCountMap[c.word] = c.count;

    const diff      = session.total_filler_count - prevSession.total_filler_count;
    const rateDiff  = calcRate(session.total_filler_count, session.char_count)
                    - calcRate(prevSession.total_filler_count, prevSession.char_count);

    prevComparison = {
      prevTotal:    prevSession.total_filler_count,
      prevCharCount: prevSession.char_count,
      prevRate:     calcRate(prevSession.total_filler_count, prevSession.char_count),
      prevDate:     prevSession.meeting_date,
      diff,
      rateDiff:     Math.round(rateDiff * 10) / 10,
      wordDiffs: counts.map((c) => ({
        word: c.word,
        current: c.count,
        prev: prevCountMap[c.word] || 0,
        diff: c.count - (prevCountMap[c.word] || 0),
      })),
    };
  }

  return NextResponse.json({
    session: {
      ...session,
      rate: calcRate(session.total_filler_count, session.char_count),
    },
    counts,
    occurrences,
    speakers,
    speakerCounts,
    speakerCharCounts,
    speakerRates,
    prevComparison,
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id, 10);
  const db = getDb();

  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return NextResponse.json({ error: '商談が見つかりません' }, { status: 404 });

  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);

  return NextResponse.json({ ok: true });
}
