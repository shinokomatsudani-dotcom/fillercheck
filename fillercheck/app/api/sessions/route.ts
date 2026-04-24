// UC-02 / UC-06
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb, ensureSchema } from '@/lib/db';
import { calcRate } from '@/lib/analyzer';

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await ensureSchema();
  const db = getDb();
  const speaker = req.nextUrl.searchParams.get('speaker') || null;

  const rawResult = await db.execute({
    sql: `SELECT id, filename, uploaded_at, meeting_at, meeting_result, total_filler_count, char_count, speakers
          FROM sessions WHERE user_id = ? ORDER BY COALESCE(meeting_at, uploaded_at) DESC`,
    args: [userId],
  });
  const rawSessions = rawResult.rows as unknown as {
    id: number; filename: string; uploaded_at: string; meeting_at: string | null;
    meeting_result: string | null; total_filler_count: number;
    char_count: number; speakers: string;
  }[];

  const allSpeakersSet = new Set<string>();
  for (const s of rawSessions) {
    (JSON.parse(s.speakers || '[]') as string[]).forEach((spk) => allSpeakersSet.add(spk));
  }
  const allSpeakers = [...allSpeakersSet].sort();

  let speakerFillerTotals: Record<number, number> = {};
  let speakerCharTotals: Record<number, number> = {};
  if (speaker) {
    const fillerResult = await db.execute({
      sql: `SELECT sfc.session_id, SUM(sfc.count) as total
            FROM speaker_filler_counts sfc
            JOIN sessions s ON s.id = sfc.session_id
            WHERE sfc.speaker = ? AND s.user_id = ?
            GROUP BY sfc.session_id`,
      args: [speaker, userId],
    });
    for (const r of fillerResult.rows as unknown as { session_id: number; total: number }[]) {
      speakerFillerTotals[r.session_id] = r.total;
    }

    const charResult = await db.execute({
      sql: `SELECT scc.session_id, scc.char_count
            FROM speaker_char_counts scc
            JOIN sessions s ON s.id = scc.session_id
            WHERE scc.speaker = ? AND s.user_id = ?`,
      args: [speaker, userId],
    });
    for (const r of charResult.rows as unknown as { session_id: number; char_count: number }[]) {
      speakerCharTotals[r.session_id] = r.char_count;
    }
  }

  const sessions = rawSessions
    .filter((s) => !speaker || (JSON.parse(s.speakers || '[]') as string[]).includes(speaker))
    .map((s) => {
      const fillerCount = speaker ? (speakerFillerTotals[s.id] ?? 0) : s.total_filler_count;
      const charCount   = speaker ? (speakerCharTotals[s.id]  ?? 0) : s.char_count;
      return {
        id: s.id,
        filename: s.filename,
        uploaded_at: s.uploaded_at,
        meeting_at: s.meeting_at,
        meeting_result: s.meeting_result,
        total_filler_count: fillerCount,
        char_count: charCount,
        rate: calcRate(fillerCount, charCount),
        speakers: JSON.parse(s.speakers || '[]') as string[],
      };
    });

  return NextResponse.json({ sessions, allSpeakers });
}
