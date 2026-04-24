// UC-07: 商談結果（受注/失注）を記録する
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getDb, ensureSchema } from '@/lib/db';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const sessionId = parseInt(id, 10);
  const { result } = await req.json() as { result: 'won' | 'lost' | 'ongoing' };

  if (!['won', 'lost', 'ongoing'].includes(result)) {
    return NextResponse.json({ error: '無効な商談結果です' }, { status: 400 });
  }

  await ensureSchema();
  const db = getDb();

  const existing = await db.execute({
    sql: 'SELECT meeting_result FROM sessions WHERE id = ? AND user_id = ?',
    args: [sessionId, userId],
  });
  if (!existing.rows[0]) {
    return NextResponse.json({ error: '商談が見つかりません' }, { status: 404 });
  }

  const row = existing.rows[0] as unknown as { meeting_result: string | null };
  await db.execute({
    sql: 'UPDATE sessions SET meeting_result = ? WHERE id = ?',
    args: [result, sessionId],
  });

  return NextResponse.json({ success: true, result, alreadyExisted: row.meeting_result !== null });
}
