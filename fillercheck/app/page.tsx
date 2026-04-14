'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

interface Session {
  id: number;
  filename: string;
  uploaded_at: string;
  meeting_at: string | null;
  meeting_result: 'won' | 'lost' | 'ongoing' | null;
  total_filler_count: number;
  char_count: number;
  rate: number;
  speakers: string[];
}


const GOAL_RATE = 1.0; // 100文字あたり1.0回以下を目標

const RESULT_LABEL: Record<string, string> = {
  won: '受注',
  lost: '失注',
  ongoing: '進行中',
};

const RESULT_COLOR: Record<string, string> = {
  won: 'text-green-600 bg-green-50',
  lost: 'text-red-600 bg-red-50',
  ongoing: 'text-yellow-600 bg-yellow-50',
};

const MY_NAME_KEY = 'fillercheck_my_name';

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [allSpeakers, setAllSpeakers] = useState<string[]>([]);
  const [myName, setMyName] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showNamePicker, setShowNamePicker] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fetchIdRef = useRef(0);

  // localStorageからmyName読み込み（クライアントのみ）
  useEffect(() => {
    const saved = localStorage.getItem(MY_NAME_KEY) || '';
    setMyName(saved);
  }, []);

  const fetchSessions = useCallback(async (speaker: string) => {
    const myFetchId = ++fetchIdRef.current;
    const url = speaker
      ? `/api/sessions?speaker=${encodeURIComponent(speaker)}`
      : '/api/sessions';
    const res = await fetch(url);
    const data = await res.json();
    if (fetchIdRef.current !== myFetchId) return; // 古いレスポンスは無視
    setSessions(data.sessions || []);
    setAllSpeakers(data.allSpeakers || []);
  }, []);

  useEffect(() => {
    fetchSessions(myName);
  }, [fetchSessions, myName]);

  const handleSetMyName = (name: string) => {
    setMyName(name);
    localStorage.setItem(MY_NAME_KEY, name);
    setShowNamePicker(false);
    fetchSessions(name);
  };

  const handleUpload = async (file: File) => {
    setError('');
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'アップロードに失敗しました');
      } else {
        // アップロード後に話者リストを更新してから遷移
        await fetchSessions(myName);
        window.location.href = `/sessions/${data.sessionId}`;
      }
    } catch {
      setError('通信エラーが発生しました');
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleDelete = async (id: number) => {
    setDeleting(true);
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    setConfirmDeleteId(null);
    setDeleting(false);
    await fetchSessions(myName);
  };

  const latestSession = sessions[0];
  const prevSession = sessions[1];
  const diffRateFromPrev = latestSession && prevSession
    ? Math.round((latestSession.rate - prevSession.rate) * 10) / 10
    : null;

  // myNameが設定されていて、かつ全発言者リストにない場合（古いデータ等）はリセット促す
  const myNameMissing = myName && allSpeakers.length > 0 && !allSpeakers.includes(myName);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">F</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">FillerCheck</h1>
          <span className="text-sm text-gray-400 ml-2">商談フィラーワード改善ツール</span>

          {/* あなたの名前表示 */}
          <div className="ml-auto">
            {myName ? (
              <button
                onClick={() => setShowNamePicker(true)}
                className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <span className="w-7 h-7 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-semibold text-xs">
                  {myName[0]}
                </span>
                <span className="font-medium">{myName}</span>
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </button>
            ) : allSpeakers.length > 0 ? (
              <button
                onClick={() => setShowNamePicker(true)}
                className="flex items-center gap-1.5 text-sm text-blue-600 font-medium hover:text-blue-700 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                あなたの名前を設定
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {/* 名前ピッカーモーダル */}
      {showNamePicker && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-xl max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-900 mb-1">あなたの名前を選択</h3>
            <p className="text-sm text-gray-400 mb-4">文字起こしに表示されている名前を選んでください</p>
            <div className="space-y-2 mb-4">
              {allSpeakers.map((spk) => (
                <button
                  key={spk}
                  onClick={() => handleSetMyName(spk)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                    myName === spk
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0">
                    {spk[0]}
                  </span>
                  <span className="font-medium">{spk}</span>
                  {myName === spk && (
                    <svg className="w-4 h-4 text-blue-500 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            {myName && (
              <button
                onClick={() => handleSetMyName('')}
                className="w-full text-sm text-gray-400 hover:text-gray-600 py-2"
              >
                設定を解除（全員のデータを表示）
              </button>
            )}
            <button
              onClick={() => setShowNamePicker(false)}
              className="w-full mt-1 px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* 名前未設定の案内（話者が検出されていて未設定の場合） */}
        {!myName && allSpeakers.length > 0 && (
          <section className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-900">あなたの名前を設定すると、自分の発言だけを追跡できます</p>
              <p className="text-xs text-blue-500 mt-0.5">文字起こしから {allSpeakers.length}名 の発言者が検出されています</p>
            </div>
            <button
              onClick={() => setShowNamePicker(true)}
              className="flex-shrink-0 ml-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              設定する
            </button>
          </section>
        )}

        {/* 名前が存在しないケース（古いセッション等） */}
        {myNameMissing && (
          <section className="bg-yellow-50 border border-yellow-200 rounded-xl px-5 py-4 flex items-center justify-between">
            <p className="text-sm text-yellow-800">「{myName}」が見つかりません。名前を再設定してください</p>
            <button
              onClick={() => setShowNamePicker(true)}
              className="flex-shrink-0 ml-4 px-4 py-2 bg-yellow-500 text-white text-sm font-medium rounded-lg hover:bg-yellow-600 transition-colors"
            >
              再設定
            </button>
          </section>
        )}

        {/* UC-01: ファイルアップロード */}
        <section>
          <label
            className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
              dragOver
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-gray-500">分析中...</span>
              </div>
            ) : (
              <>
                <svg className="w-10 h-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <p className="text-sm font-medium text-gray-700">
                  Gemini文字起こしファイルをドロップ、またはクリックして選択
                </p>
                <p className="text-xs text-gray-400 mt-1">.txt / .docx 対応</p>
              </>
            )}
            <input type="file" accept=".txt,.docx" className="hidden" onChange={handleFileChange} disabled={uploading} />
          </label>
          {error && (
            <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}
        </section>

        {/* サマリーカード */}
        {sessions.length > 0 && (
          <section className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">最新商談{myName ? `（${myName}）` : ''}</p>
              <p className="text-3xl font-bold text-gray-900">
                {latestSession.rate.toFixed(1)}
                <span className="text-base font-normal text-gray-500 ml-1">回/100文字</span>
              </p>
              {diffRateFromPrev !== null && (
                <p className={`text-sm mt-1 font-medium ${diffRateFromPrev < 0 ? 'text-green-600' : diffRateFromPrev > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                  {diffRateFromPrev < 0 ? `▼ ${Math.abs(diffRateFromPrev)}改善` : diffRateFromPrev > 0 ? `▲ ${diffRateFromPrev}悪化` : '前回と同じ'}
                </p>
              )}
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">目標値</p>
              <p className="text-3xl font-bold text-gray-900">
                {GOAL_RATE.toFixed(1)}
                <span className="text-base font-normal text-gray-500 ml-1">回/100文字</span>
              </p>
              <p className={`text-sm mt-1 font-medium ${latestSession.rate <= GOAL_RATE ? 'text-green-600' : 'text-orange-500'}`}>
                {latestSession.rate <= GOAL_RATE ? '目標達成' : `あと${(latestSession.rate - GOAL_RATE).toFixed(1)}回`}
              </p>
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-200">
              <p className="text-xs text-gray-500 mb-1">商談数</p>
              <p className="text-3xl font-bold text-gray-900">
                {sessions.length}
                <span className="text-base font-normal text-gray-500 ml-1">件</span>
              </p>
            </div>
          </section>
        )}

        {/* UC-06: 推移グラフ（会議ごと） */}
        {(() => {
          // 古い順に並べて各会議を1データポイントとして使う
          const chartData = [...sessions].reverse().map((s) => {
            const dateStr = s.meeting_at ?? s.uploaded_at;
            const d = new Date(dateStr);
            const label = `${d.getMonth() + 1}/${d.getDate()}`;
            return { label, rate: s.rate, filename: s.filename };
          });
          if (chartData.length < 2) return chartData.length === 1 ? (
            <section className="bg-white rounded-xl border border-gray-200 p-6 text-center text-gray-500 text-sm">
              あと1回アップロードすると推移グラフが見られます
            </section>
          ) : null;
          const last = chartData[chartData.length - 1];
          const prev = chartData[chartData.length - 2];
          const d = Math.round((last.rate - prev.rate) * 10) / 10;
          return (
            <section className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">
                推移{myName ? <span className="text-sm font-normal text-gray-400 ml-2">{myName}</span> : ''}
              </h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v) => [`${v}回/100文字`, '正規化レート']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.filename ?? ''}
                  />
                  <ReferenceLine
                    y={GOAL_RATE}
                    stroke="#f97316"
                    strokeDasharray="4 4"
                    label={{ value: `目標${GOAL_RATE}回`, position: 'right', fontSize: 11, fill: '#f97316' }}
                  />
                  <Line type="monotone" dataKey="rate" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
              <p className={`text-sm mt-3 font-medium ${d <= 0 ? 'text-green-600' : 'text-red-500'}`}>
                前回比: {d <= 0 ? `▼ ${Math.abs(d)}回/100文字 改善` : `▲ ${d}回/100文字 悪化`}
              </p>
            </section>
          );
        })()}

        {/* UC-02: 商談一覧 */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">商談履歴</h2>
          {sessions.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">
              まだ商談データがありません。最初の文字起こしをアップロードしましょう
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="relative">
                  {confirmDeleteId === s.id ? (
                    <div className="flex items-center justify-between bg-red-50 rounded-xl border border-red-200 px-5 py-4">
                      <p className="text-sm text-red-700">「{s.filename}」を削除しますか？</p>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                        <button
                          onClick={() => handleDelete(s.id)}
                          disabled={deleting}
                          className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                        >
                          削除
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-3 py-1.5 border border-gray-300 text-sm text-gray-600 rounded-lg hover:bg-gray-50"
                        >
                          キャンセル
                        </button>
                      </div>
                    </div>
                  ) : (
                    <Link
                      href={`/sessions/${s.id}`}
                      className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4 hover:border-blue-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex-shrink-0 w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center">
                          <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{s.filename}</p>
                          <p className="text-xs text-gray-400">{new Date(s.uploaded_at).toLocaleString('ja-JP')}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                        {s.meeting_result && (
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${RESULT_COLOR[s.meeting_result]}`}>
                            {RESULT_LABEL[s.meeting_result]}
                          </span>
                        )}
                        <span className={`text-lg font-bold ${s.rate <= GOAL_RATE ? 'text-green-600' : 'text-gray-900'}`}>
                          {s.rate.toFixed(1)}<span className="text-xs font-normal text-gray-400 ml-0.5">回/100字</span>
                        </span>
                        <button
                          onClick={(e) => { e.preventDefault(); setConfirmDeleteId(s.id); }}
                          className="p-1.5 text-gray-300 hover:text-red-400 transition-colors rounded"
                          title="削除"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
