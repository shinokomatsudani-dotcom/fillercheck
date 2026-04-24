// UC-03 / UC-04 / UC-05
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb, ensureSchema } from '@/lib/db';
import { calcRate } from '@/lib/analyzer';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sessionId = parseInt(id, 10);
  await ensureSchema();
  const db = getDb();

  const sessionResult = await db.execute({
    sql: 'SELECT * FROM sessions WHERE id = ? AND user_id = ?',
    args: [sessionId, userId],
  });
  const session = sessionResult.rows[0] as unknown as {
    id: number; filename: string; uploaded_at: string;
    meeting_result: string | null; total_filler_count: number;
    char_count: number; speakers: string;
  } | undefined;

  if (!session) return NextResponse.json({ error: '商談が見つかりません' }, { status: 404 });

  const speakers: string[] = JSON.parse(session.speakers || '[]');

  const countsResult = await db.execute({
    sql: 'SELECT word, count FROM filler_counts WHERE session_id = ? ORDER BY count DESC',
    args: [sessionId],
  });
  const counts = countsResult.rows as unknown as { word: string; count: number }[];

  const occResult = await db.execute({
    sql: 'SELECT word, position, context, occurrence_index, speaker FROM filler_occurrences WHERE session_id = ? ORDER BY position ASC',
    args: [sessionId],
  });
  const occurrences = occResult.rows as unknown as { word: string; position: number; context: string; occurrence_index: number; speaker: string | null }[];

  const spkCountResult = await db.execute({
    sql: 'SELECT speaker, word, count FROM speaker_filler_counts WHERE session_id = ?',
    args: [sessionId],
  });
  const speakerCounts: Record<string, { word: string; count: number }[]> = {};
  for (const row of spkCountResult.rows as unknown as { speaker: string; word: string; count: number }[]) {
    if (!speakerCounts[row.speaker]) speakerCounts[row.speaker] = [];
    speakerCounts[row.speaker].push({ word: row.word, count: row.count });
  }
  for (const spk of Object.keys(speakerCounts)) {
    speakerCounts[spk].sort((a, b) => b.count - a.count);
  }

  const charResult = await db.execute({
    sql: 'SELECT speaker, char_count FROM speaker_char_counts WHERE session_id = ?',
    args: [sessionId],
  });
  const speakerCharCounts: Record<string, number> = {};
  for (const r of charResult.rows as unknown as { speaker: string; char_count: number }[]) {
    speakerCharCounts[r.speaker] = r.char_count;
  }

  const speakerRates: Record<string, number> = {};
  for (const spk of speakers) {
    const fillers = (speakerCounts[spk] || []).reduce((s, c) => s + c.count, 0);
    speakerRates[spk] = calcRate(fillers, speakerCharCounts[spk] || 0);
  }

  const currentResult = await db.execute({
    sql: `SELECT COALESCE(meeting_at, uploaded_at) as sort_at FROM sessions WHERE id = ? AND user_id = ?`,
    args: [sessionId, userId],
  });
  const currentSession = currentResult.rows[0] as unknown as { sort_at: string } | undefined;

  let prevComparison = null;
  if (currentSession) {
    const prevResult = await db.execute({
      sql: `SELECT id, total_filler_count, char_count, COALESCE(meeting_at, uploaded_at) as meeting_date
            FROM sessions
            WHERE COALESCE(meeting_at, uploaded_at) < ? AND id != ? AND user_id = ?
            ORDER BY COALESCE(meeting_at, uploaded_at) DESC LIMIT 1`,
      args: [currentSession.sort_at, sessionId, userId],
    });
    const prevSession = prevResult.rows[0] as unknown as { id: number; total_filler_count: number; char_count: number; meeting_date: string } | undefined;

    if (prevSession) {
      const prevCountsResult = await db.execute({
        sql: 'SELECT word, count FROM filler_counts WHERE session_id = ?',
        args: [prevSession.id],
      });
      const prevCountMap: Record<string, number> = {};
      for (const c of prevCountsResult.rows as unknown as { word: string; count: number }[]) {
        prevCountMap[c.word] = c.count;
      }

      const diff     = session.total_filler_count - prevSession.total_filler_count;
      const rateDiff = calcRate(session.total_filler_count, session.char_count)
                     - calcRate(prevSession.total_filler_count, prevSession.char_count);

      prevComparison = {
        prevTotal:     prevSession.total_filler_count,
        prevCharCount: prevSession.char_count,
        prevRate:      calcRate(prevSession.total_filler_count, prevSession.char_count),
        prevDate:      prevSession.meeting_date,
        diff,
        rateDiff:      Math.round(rateDiff * 10) / 10,
        wordDiffs: counts.map((c) => ({
          word:    c.word,
          current: c.count,
          prev:    prevCountMap[c.word] || 0,
          diff:    c.count - (prevCountMap[c.word] || 0),
        })),
      };
    }
  }

  return NextResponse.json({
    session: { ...session, rate: calcRate(session.total_filler_count, session.char_count) },
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
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sessionId = parseInt(id, 10);
  await ensureSchema();
  const db = getDb();

  const existing = await db.execute({
    sql: 'SELECT id FROM sessions WHERE id = ? AND user_id = ?',
    args: [sessionId, userId],
  });
  if (!existing.rows[0]) return NextResponse.json({ error: '商談が見つかりません' }, { status: 404 });

  await db.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [sessionId] });

  return NextResponse.json({ ok: true });
}
