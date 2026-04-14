// UC-02 / UC-06
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { calcRate } from '@/lib/analyzer';

export async function GET(req: NextRequest) {
  const db = getDb();
  const speaker = req.nextUrl.searchParams.get('speaker') || null;

  const rawSessions = db.prepare(
    `SELECT id, filename, uploaded_at, meeting_at, meeting_result, total_filler_count, char_count, speakers
     FROM sessions ORDER BY COALESCE(meeting_at, uploaded_at) DESC`
  ).all() as {
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
    const fillerRows = db.prepare(
      `SELECT session_id, SUM(count) as total FROM speaker_filler_counts WHERE speaker = ? GROUP BY session_id`
    ).all(speaker) as { session_id: number; total: number }[];
    for (const r of fillerRows) speakerFillerTotals[r.session_id] = r.total;

    const charRows = db.prepare(
      `SELECT session_id, char_count FROM speaker_char_counts WHERE speaker = ?`
    ).all(speaker) as { session_id: number; char_count: number }[];
    for (const r of charRows) speakerCharTotals[r.session_id] = r.char_count;
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

  const weeklyData = computeWeeklyData(sessions);

  return NextResponse.json({ sessions, weeklyData, allSpeakers });
}

function computeWeeklyData(
  sessions: { uploaded_at: string; meeting_at: string | null; total_filler_count: number; char_count: number }[]
) {
  const weekMap: Record<string, { fillers: number[]; chars: number }> = {};

  for (const s of sessions) {
    const week = getWeekLabel(new Date(s.meeting_at ?? s.uploaded_at));
    if (!weekMap[week]) weekMap[week] = { fillers: [], chars: 0 };
    weekMap[week].fillers.push(s.total_filler_count);
    weekMap[week].chars += s.char_count;
  }

  return Object.entries(weekMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, { fillers, chars }]) => {
      const totalFillers = fillers.reduce((a, b) => a + b, 0);
      return {
        week,
        rate: calcRate(totalFillers, chars),          // 週単位の正規化レート
        avg: Math.round(totalFillers / fillers.length), // 生の平均（参考値）
        sessions: fillers.length,
      };
    });
}

function getWeekLabel(date: Date): string {
  const year = date.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const weekNum = Math.ceil(
    ((date.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
  );
  return `${year}-W${String(weekNum).padStart(2, '0')}`;
}
