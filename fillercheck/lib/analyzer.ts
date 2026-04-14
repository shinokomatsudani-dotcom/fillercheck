// UC-10: フィラーワード自動検出・集計エンジン（発言者対応版）

export const FILLER_WORDS = [
  'えっと', 'えーと', 'えーっと',
  'なんか', 'なんかー',
  'あの', 'あのー', 'あのう',
  'まあ', 'まー',
  'えー', 'えーー',
  'あー', 'あーー',
  'うーん', 'うーーん',
  'そのー', 'その',
  'ちょっと',
  'やっぱり', 'やはり', 'やっぱ',
];

export interface SpeakerSegment {
  speaker: string | null;
  text: string;
}

export interface FillerOccurrence {
  word: string;
  position: number;
  context: string;
  occurrenceIndex: number;
  speaker: string | null;
}

export interface AnalysisResult {
  counts: Record<string, number>;
  total: number;
  charCount: number;                              // 全体の発言文字数
  occurrences: FillerOccurrence[];
  speakers: string[];
  speakerCounts: Record<string, Record<string, number>>;
  speakerCharCounts: Record<string, number>;      // 話者別の発言文字数
}

/** 発言テキストの「実質文字数」を計算（空白・記号類を除く） */
function countChars(text: string): number {
  // 空白、改行、タイムスタンプ的なものを除いた文字数
  return text.replace(/[\s\u3000]/g, '').length;
}

/**
 * HTMLから発言者セグメントを抽出（Gemini docx形式）
 * <strong>発言者名:</strong> テキスト パターンを解析
 */
export function parseSegmentsFromHtml(html: string): SpeakerSegment[] {
  const segments: SpeakerSegment[] = [];

  const blockRegex = /<strong>([^<:：]+)[：:]<\/strong>\s*([\s\S]*?)(?=<strong>[^<]+[：:]<\/strong>|$)/g;
  let match;

  while ((match = blockRegex.exec(html)) !== null) {
    const speaker = match[1].trim();
    const rawText = match[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (rawText) {
      segments.push({ speaker, text: rawText });
    }
  }

  if (segments.length === 0) {
    const plainText = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    segments.push(...parseSegmentsFromText(plainText));
  }

  return segments;
}

/**
 * プレーンテキストから発言者セグメントを抽出
 */
export function parseSegmentsFromText(text: string): SpeakerSegment[] {
  const lines = text.split(/\n/);
  const segments: SpeakerSegment[] = [];

  const speakerLineRegex = /^\s*([^\n:：\d][^:：\n]{0,28})[：:]\s*(.*)/;

  let currentSpeaker: string | null = null;
  let currentText: string[] = [];

  for (const line of lines) {
    const m = speakerLineRegex.exec(line);
    if (m) {
      const candidateName = m[1].trim();
      if (/^\d{2}:\d{2}:\d{2}$/.test(candidateName)) {
        currentText.push(line.trim());
        continue;
      }
      if (currentText.length > 0) {
        segments.push({ speaker: currentSpeaker, text: currentText.join(' ') });
      }
      currentSpeaker = candidateName;
      currentText = [m[2].trim()];
    } else {
      const trimmed = line.trim();
      if (trimmed) currentText.push(trimmed);
    }
  }

  if (currentText.length > 0) {
    segments.push({ speaker: currentSpeaker, text: currentText.join(' ') });
  }

  return segments;
}

/**
 * セグメント配列からフィラーワードを検出・集計
 */
export function analyzeSegments(segments: SpeakerSegment[]): AnalysisResult {
  const counts: Record<string, number> = {};
  const occurrences: FillerOccurrence[] = [];
  const wordIndices: Record<string, number> = {};
  const speakerCounts: Record<string, Record<string, number>> = {};
  const speakerCharCounts: Record<string, number> = {};
  const speakerSet = new Set<string>();
  let totalCharCount = 0;

  let sentenceOffset = 0;

  for (const segment of segments) {
    const speaker = segment.speaker;
    if (speaker) speakerSet.add(speaker);

    // 文字数を計測
    const chars = countChars(segment.text);
    totalCharCount += chars;
    if (speaker) {
      speakerCharCounts[speaker] = (speakerCharCounts[speaker] || 0) + chars;
    }

    const sentences = splitIntoSentences(segment.text);

    sentences.forEach((sentence, localIdx) => {
      const globalIdx = sentenceOffset + localIdx;

      for (const word of FILLER_WORDS) {
        const regex = new RegExp(word, 'g');
        while (regex.exec(sentence) !== null) {
          counts[word] = (counts[word] || 0) + 1;
          wordIndices[word] = (wordIndices[word] || 0) + 1;

          if (speaker) {
            if (!speakerCounts[speaker]) speakerCounts[speaker] = {};
            speakerCounts[speaker][word] = (speakerCounts[speaker][word] || 0) + 1;
          }

          const start = Math.max(0, localIdx - 2);
          const end = Math.min(sentences.length - 1, localIdx + 2);
          const context = (speaker ? `${speaker}: ` : '') + sentences.slice(start, end + 1).join(' ');

          occurrences.push({
            word,
            position: globalIdx,
            context,
            occurrenceIndex: wordIndices[word],
            speaker: speaker ?? null,
          });
        }
      }
    });

    sentenceOffset += sentences.length;
  }

  const deduped = deduplicateOccurrences(occurrences);

  return {
    counts,
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    charCount: totalCharCount,
    occurrences: deduped,
    speakers: [...speakerSet],
    speakerCounts,
    speakerCharCounts,
  };
}

/** 後方互換: テキスト文字列から直接解析 */
export function analyzeText(text: string): AnalysisResult {
  const segments = parseSegmentsFromText(text);
  return analyzeSegments(segments);
}

/** 100文字あたりのフィラーワード数を計算 */
export function calcRate(fillerCount: number, charCount: number): number {
  if (charCount === 0) return 0;
  return Math.round((fillerCount / charCount) * 1000) / 10; // 小数第1位まで
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/[。！？\!\?\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function deduplicateOccurrences(occurrences: FillerOccurrence[]): FillerOccurrence[] {
  const seen = new Set<string>();
  const result: FillerOccurrence[] = [];
  for (const occ of occurrences) {
    const key = `${occ.word}:${occ.position}:${occ.occurrenceIndex}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(occ);
    }
  }
  return result;
}
