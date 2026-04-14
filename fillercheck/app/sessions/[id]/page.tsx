'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';

interface FillerCount {
  word: string;
  count: number;
}

interface Occurrence {
  word: string;
  position: number;
  context: string;
  occurrence_index: number;
  speaker: string | null;
}

interface PrevComparison {
  prevTotal: number;
  prevCharCount: number;
  prevRate: number;
  prevDate: string;
  diff: number;
  rateDiff: number;
  wordDiffs: { word: string; current: number; prev: number; diff: number }[];
}

interface SessionDetail {
  session: {
    id: number;
    filename: string;
    uploaded_at: string;
    meeting_result: 'won' | 'lost' | 'ongoing' | null;
    total_filler_count: number;
    char_count: number;
    rate: number;
  };
  counts: FillerCount[];
  occurrences: Occurrence[];
  speakers: string[];
  speakerCounts: Record<string, FillerCount[]>;
  speakerCharCounts: Record<string, number>;
  speakerRates: Record<string, number>;
  prevComparison: PrevComparison | null;
}

// 100文字あたりの目標レート（生の目標10回 ÷ 平均的な発言量で換算）
const GOAL_RATE = 1.0; // 100文字あたり1.0回以下を目標
const MY_NAME_KEY = 'fillercheck_my_name';

const RESULT_LABEL: Record<string, string> = { won: '受注', lost: '失注', ongoing: '進行中' };
const RESULT_COLOR: Record<string, string> = {
  won: 'border-green-400 text-green-700 bg-green-50',
  lost: 'border-red-400 text-red-700 bg-red-50',
  ongoing: 'border-yellow-400 text-yellow-700 bg-yellow-50',
};

function calcRate(fillerCount: number, charCount: number): number {
  if (charCount === 0) return 0;
  return Math.round((fillerCount / charCount) * 1000) / 10;
}

export default function SessionPage() {
  const params = useParams();
  const id = params.id as string;

  const [data, setData] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [myName, setMyName] = useState<string>('');
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [savingResult, setSavingResult] = useState(false);
  const [showResultMenu, setShowResultMenu] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState<'won' | 'lost' | 'ongoing' | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(MY_NAME_KEY) || '';
    setMyName(saved);
  }, []);

  useEffect(() => {
    fetch(`/api/sessions/${id}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [id]);

  const handleSetResult = async (result: 'won' | 'lost' | 'ongoing') => {
    if (data?.session.meeting_result && data.session.meeting_result !== result) {
      setConfirmOverwrite(result);
      return;
    }
    await saveResult(result);
  };

  const saveResult = async (result: 'won' | 'lost' | 'ongoing') => {
    setSavingResult(true);
    setShowResultMenu(false);
    setConfirmOverwrite(null);
    await fetch(`/api/sessions/${id}/result`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result }),
    });
    const res = await fetch(`/api/sessions/${id}`);
    setData(await res.json());
    setSavingResult(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || !data.session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-500">商談が見つかりません</p>
      </div>
    );
  }

  const { session, counts, occurrences, speakers, speakerCounts, speakerCharCounts, speakerRates, prevComparison } = data;

  const activeSpeaker = myName && speakers.includes(myName) ? myName : null;

  const displayCounts: FillerCount[] = activeSpeaker
    ? (speakerCounts[activeSpeaker] || [])
    : counts;

  const displayFillerTotal = activeSpeaker
    ? (speakerCounts[activeSpeaker] || []).reduce((s, c) => s + c.count, 0)
    : session.total_filler_count;

  const displayCharCount = activeSpeaker
    ? (speakerCharCounts[activeSpeaker] || 0)
    : session.char_count;

  const displayRate = activeSpeaker
    ? (speakerRates[activeSpeaker] ?? calcRate(displayFillerTotal, displayCharCount))
    : session.rate;

  const filteredOccurrences = occurrences.filter((o) => {
    if (activeSpeaker && o.speaker !== activeSpeaker) return false;
    if (selectedWord && o.word !== selectedWord) return false;
    return true;
  });

  // フォーカスポイント（フィルタ済みカウントから計算）
  const focusWord = displayCounts[0] || null;
  const focusPoint = focusWord
    ? `最も多いフィラーワード「${focusWord.word}」（${focusWord.count}回）を意識しましょう`
    : null;

  const isGoalAchieved = displayRate <= GOAL_RATE;
  const showPrevComparison = !activeSpeaker && prevComparison;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <Link href="/" className="text-gray-500 hover:text-gray-900 transition-colors mr-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">F</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">FillerCheck</h1>
          {activeSpeaker && (
            <span className="ml-auto flex items-center gap-1.5 text-xs text-gray-500">
              <span className="w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-xs">
                {activeSpeaker[0]}
              </span>
              {activeSpeaker}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* ファイル情報 + 商談結果 */}
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 truncate max-w-md">{session.filename}</h2>
            <p className="text-sm text-gray-400">{new Date(session.uploaded_at).toLocaleString('ja-JP')}</p>
          </div>
          <div className="relative">
            <button
              onClick={() => setShowResultMenu((v) => !v)}
              disabled={savingResult}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-all ${
                session.meeting_result
                  ? RESULT_COLOR[session.meeting_result]
                  : 'border-gray-300 text-gray-600 bg-white hover:border-gray-400'
              }`}
            >
              {session.meeting_result ? RESULT_LABEL[session.meeting_result] : '結果を記録'}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showResultMenu && (
              <div className="absolute right-0 mt-1 w-36 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                {(['won', 'lost', 'ongoing'] as const).map((r) => (
                  <button key={r} onClick={() => handleSetResult(r)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">
                    {RESULT_LABEL[r]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 上書き確認モーダル */}
        {confirmOverwrite && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
              <p className="text-sm text-gray-700 mb-4">すでに結果が記録されています。上書きしますか？</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmOverwrite(null)}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                  キャンセル
                </button>
                <button onClick={() => saveResult(confirmOverwrite)}
                  className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
                  上書き
                </button>
              </div>
            </div>
          </div>
        )}

        {/* フォーカスポイント */}
        {focusPoint && (
          <section className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4">
            <p className="text-xs font-semibold text-blue-500 mb-1">今日のフォーカスポイント</p>
            <p className="text-sm font-medium text-blue-900">{focusPoint}</p>
          </section>
        )}

        {/* UC-03: フィラーワード集計 */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-5">
            <h3 className="text-base font-semibold text-gray-900">フィラーワード集計</h3>

            {/* 主指標: 正規化レート */}
            <div className="text-right">
              <div className="flex items-baseline gap-1 justify-end">
                <span className={`text-3xl font-bold ${isGoalAchieved ? 'text-green-600' : 'text-gray-900'}`}>
                  {displayRate.toFixed(1)}
                </span>
                <span className="text-sm text-gray-400">回/100文字</span>
              </div>
              <p className={`text-xs font-medium mt-0.5 ${isGoalAchieved ? 'text-green-600' : 'text-orange-500'}`}>
                {isGoalAchieved ? `目標達成（目標 ${GOAL_RATE}回以下）` : `目標 ${GOAL_RATE}回以下まであと${(displayRate - GOAL_RATE).toFixed(1)}回`}
              </p>
              {/* 副指標: 生の数字 */}
              <p className="text-xs text-gray-400 mt-1">
                {displayFillerTotal}回 ／ {displayCharCount.toLocaleString()}文字
              </p>
            </div>
          </div>

          {displayCounts.length === 0 ? (
            <p className="text-sm text-gray-500">フィラーワードは検出されませんでした</p>
          ) : (
            <div className="space-y-2">
              {displayCounts.map((c) => {
                const pct = displayFillerTotal > 0 ? Math.round((c.count / displayFillerTotal) * 100) : 0;
                const isSelected = selectedWord === c.word;
                return (
                  <button key={c.word} onClick={() => setSelectedWord(isSelected ? null : c.word)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left ${
                      isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-sm font-semibold text-gray-800 w-20 flex-shrink-0">「{c.word}」</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="bg-blue-400 h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-bold text-gray-700 w-12 text-right flex-shrink-0">{c.count}回</span>
                    <svg className={`w-4 h-4 flex-shrink-0 transition-transform ${isSelected ? 'text-blue-500 rotate-180' : 'text-gray-300'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* UC-05: 前回比較（話者フィルタなし時のみ） */}
        {showPrevComparison && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-4">前回比較</h3>
            <div className="flex items-center gap-6 mb-4">
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">今回</p>
                <p className="text-2xl font-bold text-gray-900">{session.rate.toFixed(1)}<span className="text-xs font-normal text-gray-400 ml-1">回/100文字</span></p>
                <p className="text-xs text-gray-400 mt-0.5">{session.total_filler_count}回 / {session.char_count.toLocaleString()}文字</p>
              </div>
              <div className="flex-1 text-center">
                <p className={`text-xl font-bold ${prevComparison.rateDiff < 0 ? 'text-green-600' : prevComparison.rateDiff > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {prevComparison.rateDiff < 0
                    ? `▼ ${Math.abs(prevComparison.rateDiff).toFixed(1)}`
                    : prevComparison.rateDiff > 0
                    ? `▲ ${prevComparison.rateDiff.toFixed(1)}`
                    : '変化なし'}
                </p>
                <p className="text-xs text-gray-400">回/100文字</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">前回</p>
                <p className="text-2xl font-bold text-gray-400">{prevComparison.prevRate.toFixed(1)}<span className="text-xs font-normal text-gray-400 ml-1">回/100文字</span></p>
                <p className="text-xs text-gray-400 mt-0.5">{prevComparison.prevTotal}回 / {prevComparison.prevCharCount.toLocaleString()}文字</p>
              </div>
            </div>
            <div className="space-y-2 mt-2">
              {prevComparison.wordDiffs.map((w) => (
                <div key={w.word} className="flex items-center justify-between text-sm px-1">
                  <span className="text-gray-700">「{w.word}」</span>
                  <span className="text-gray-400">{w.prev}回 → {w.current}回</span>
                  <span className={`font-medium ${w.diff < 0 ? 'text-green-600' : w.diff > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    {w.diff < 0 ? `▼${Math.abs(w.diff)}` : w.diff > 0 ? `▲${w.diff}` : '±0'}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* UC-04: 発言箇所ハイライト */}
        {filteredOccurrences.length > 0 && (
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">
              発言箇所
              {selectedWord && <span className="ml-2 text-blue-600 text-sm font-medium">「{selectedWord}」に絞り込み中</span>}
            </h3>
            <p className="text-xs text-gray-400 mb-4">{filteredOccurrences.length}件</p>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {filteredOccurrences.map((occ, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                      「{occ.word}」
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {highlightWord(occ.context, occ.word)}
                  </p>
                </div>
              ))}
            </div>
            {selectedWord && (
              <button onClick={() => setSelectedWord(null)}
                className="mt-3 text-xs text-gray-400 hover:text-gray-600 underline">
                絞り込みを解除
              </button>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function highlightWord(context: string, word: string): React.ReactNode {
  const parts = context.split(new RegExp(`(${word})`, 'g'));
  return parts.map((part, i) =>
    part === word ? (
      <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5 font-semibold not-italic">
        {part}
      </mark>
    ) : part
  );
}
