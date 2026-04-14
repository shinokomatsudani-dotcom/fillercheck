// UC-07: 商談結果（受注/失注）を記録する
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = parseInt(id, 10);
  const { result } = await req.json() as { result: 'won' | 'lost' | 'ongoing' };

  if (!['won', 'lost', 'ongoing'].includes(result)) {
    return NextResponse.json({ error: '無効な商談結果です' }, { status: 400 });
  }

  const db = getDb();
  const existing = db.prepare('SELECT meeting_result FROM sessions WHERE id = ?').get(sessionId) as
    | { meeting_result: string | null }
    | undefined;

  if (!existing) {
    return NextResponse.json({ error: '商談が見つかりません' }, { status: 404 });
  }

  db.prepare('UPDATE sessions SET meeting_result = ? WHERE id = ?').run(result, sessionId);

  return NextResponse.json({ success: true, result, alreadyExisted: existing.meeting_result !== null });
}
