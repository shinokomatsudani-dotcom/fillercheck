// UC-02 / UC-06
import { NextRequest, NextResponse } from 'next/server';
import { getDb, ensureSchema } from '@/lib/db';
import { calcRate } from '@/lib/analyzer';

export async function GET(req: NextRequest) {
  await ensureSchema();
  const db = getDb();
  const speaker = req.nextUrl.searchParams.get('speaker') || null;

  const rawResult = await db.execute(
    `SELECT id, filename, uploaded_at, meeting_at, meeting_result, total_filler_count, char_count, speakers
     FROM sessions ORDER BY COALESCE(meeting_at, uploaded_at) DESC`
  );
  const rawSessions = rawResult.rows as unknown as {
    id: number; filename: string; uploaded_at: string; meeting_at: string | null;
    meeting_result: string | null; total_filler_count: number;
    char_count: number; speakers: string;
  }[];

  // 全セッションの話者一覧
  const allSpeakersSet = new Set<string>();
  for (const s of rawSessions) {
    (JSON.parse(s.speakers || '[]') as string[]).forEach((spk) => allSpeakersSet.add(spk));
  }
  const allSpeakers = [...allSpeakersSet].sort();

  // 話者フィルタ時: 話者別フィラー数・文字数を取得
  let speakerFillerTotals: Record<number, number> = {};
  let speakerCharTotals: Record<number, number> = {};
  if (speaker) {
    const fillerResult = await db.execute({
      sql: `SELECT session_id, SUM(count) as total FROM speaker_filler_counts WHERE speaker = ? GROUP BY session_id`,
      args: [speaker],
    });
    for (const r of fillerResult.rows as unknown as { session_id: number; total: number }[]) {
      speakerFillerTotals[r.session_id] = r.total;
    }

    const charResult = await db.execute({
      sql: `SELECT session_id, char_count FROM speaker_char_counts WHERE speaker = ?`,
      args: [speaker],
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
