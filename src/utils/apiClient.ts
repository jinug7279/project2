import {
  type BiomechanicsReport,
  type JointStatSummary,
  type KeyframeSnapshot,
} from "../types/biomechanics";

export interface BiomechanicsApiPayload {
  exerciseType: string;
  fileName: string;
  durationSec: number;
  framesDetected: number;
  totalFramesSampled: number;
  avgTrunkLean: number | null;
  summary: JointStatSummary[];
  keyframes: KeyframeSnapshot[];
}

export async function requestAiBiomechanicsReport(
  payload: BiomechanicsApiPayload
): Promise<BiomechanicsReport> {
  const response = await fetch("/api/analyze-biomechanics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => null)) as
    | { report?: BiomechanicsReport; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(
      data?.error || `AI 분석 서버 응답 오류 (HTTP ${response.status})`
    );
  }

  if (!data?.report) {
    throw new Error("AI 분석 결과 형식이 올바르지 않습니다.");
  }

  return data.report;
}
