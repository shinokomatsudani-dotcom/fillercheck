// UC-01: 文字起こしファイルをアップロードする
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { parseSegmentsFromHtml, parseSegmentsFromText, analyzeSegments } from '@/lib/analyzer';
import mammoth from 'mammoth';

const ALLOWED_EXTS = ['.txt', '.docx'];

// ファイル名から "yyyy_mm_dd hh_mm JST" パターンを抽出してISO文字列に変換
function parseMeetingDateFromFilename(filename: string): string | null {
  const m = filename.match(/(\d{4})_(\d{2})_(\d{2})\s+(\d{2})_(\d{2})\s+JST/);
  if (!m) return null;
  const [, year, month, day, hour, minute] = m;
  // JSTはUTC+9なので9時間引いてUTCに変換
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+09:00`);
  return isNaN(date.getTime()) ? null : date.toISOString();
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 });
  }

  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!ALLOWED_EXTS.includes(ext)) {
    return NextResponse.json(
      { error: '.txtまたは.docxファイルをアップロードしてください' },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let analysis;
  if (ext === '.txt') {
    const text = buffer.toString('utf-8');
    if (!text.trim()) {
      return NextResponse.json({ error: '内容が空のファイルです' }, { status: 400 });
    }
    analysis = analyzeSegments(parseSegmentsFromText(text));
  } else {
    const [htmlResult, rawResult] = await Promise.all([
      mammoth.convertToHtml({ buffer }),
      mammoth.extractRawText({ buffer }),
    ]);
    if (!rawResult.value.trim()) {
      return NextResponse.json({ error: '内容が空のファイルです' }, { status: 400 });
    }
    analysis = analyzeSegments(parseSegmentsFromHtml(htmlResult.value));
  }

  const db = getDb();
  const now = new Date().toISOString();
  const meetingAt = parseMeetingDateFromFilename(file.name);

  const sessionResult = db.prepare(
    'INSERT INTO sessions (filename, uploaded_at, meeting_at, total_filler_count, char_count, speakers) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(file.name, now, meetingAt, analysis.total, analysis.charCount, JSON.stringify(analysis.speakers));
  const sessionId = sessionResult.lastInsertRowid as number;

  // フィラーワード種類別カウント
  const countStmt = db.prepare('INSERT INTO filler_counts (session_id, word, count) VALUES (?, ?, ?)');
  for (const [word, count] of Object.entries(analysis.counts)) {
    countStmt.run(sessionId, word, count);
  }

  // 発言箇所（speaker付き）
  const occStmt = db.prepare(
    'INSERT INTO filler_occurrences (session_id, word, position, context, occurrence_index, speaker) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const occ of analysis.occurrences) {
    occStmt.run(sessionId, occ.word, occ.position, occ.context, occ.occurrenceIndex, occ.speaker ?? null);
  }

  // 話者別フィラーカウント
  const speakerCountStmt = db.prepare(
    'INSERT INTO speaker_filler_counts (session_id, speaker, word, count) VALUES (?, ?, ?, ?)'
  );
  for (const [speaker, wordCounts] of Object.entries(analysis.speakerCounts)) {
    for (const [word, count] of Object.entries(wordCounts)) {
      speakerCountStmt.run(sessionId, speaker, word, count);
    }
  }

  // 話者別文字数
  const charCountStmt = db.prepare(
    'INSERT INTO speaker_char_counts (session_id, speaker, char_count) VALUES (?, ?, ?)'
  );
  for (const [speaker, chars] of Object.entries(analysis.speakerCharCounts)) {
    charCountStmt.run(sessionId, speaker, chars);
  }

  return NextResponse.json({
    sessionId,
    total: analysis.total,
    charCount: analysis.charCount,
    counts: analysis.counts,
    speakers: analysis.speakers,
  });
}
