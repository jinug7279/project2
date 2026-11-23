import React, { useMemo, useState } from "react";
import { ArrowLeftRight, FolderOpen, Play, Search, Trash2 } from "lucide-react";
import { type AnalysisSession, JOINT_META, type JointGroup } from "../types/biomechanics";

interface HistoryCompareViewProps {
  mode: "compare" | "history";
  sessions: AnalysisSession[];
  compareAId: string | null;
  compareBId: string | null;
  onSelectCompareA: (id: string) => void;
  onSelectCompareB: (id: string) => void;
  onOpenSession: (session: AnalysisSession) => void;
  onDeleteSession: (id: string) => void;
  onStartSimulation: () => void;
}

const COMPARE_JOINTS: JointGroup[] = ["knee", "hip", "ankle", "shoulder", "elbow", "wrist"];

export const HistoryCompareView: React.FC<HistoryCompareViewProps> = ({
  mode,
  sessions,
  compareAId,
  compareBId,
  onSelectCompareA,
  onSelectCompareB,
  onOpenSession,
  onDeleteSession,
  onStartSimulation,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedJoint, setSelectedJoint] = useState<JointGroup>("knee");
  const [selectedSide, setSelectedSide] = useState<"left" | "right">("left");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const sessionA = useMemo(
    () => sessions.find((s) => s.id === compareAId) ?? sessions[0] ?? null,
    [sessions, compareAId]
  );

  const sessionB = useMemo(
    () =>
      sessions.find((s) => s.id === compareBId) ??
      sessions.find((s) => s.id !== sessionA?.id) ??
      null,
    [sessions, compareBId, sessionA]
  );

  const filteredSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => {
      const movement = s.report?.detectedMovement?.toLowerCase() ?? "";
      return (
        s.title.toLowerCase().includes(q) ||
        s.exerciseType.toLowerCase().includes(q) ||
        movement.includes(q)
      );
    });
  }, [sessions, searchQuery]);

  const comparisonChart = useMemo(() => {
    const width = 880;
    const height = 240;
    const padL = 44;
    const padR = 20;
    const padT = 18;
    const padB = 32;
    const plotW = width - padL - padR;
    const plotH = height - padT - padB;

    const buildPath = (sess: AnalysisSession | null) => {
      if (!sess || sess.frames.length === 0) return "";
      const dur = Math.max(sess.durationSec, 0.1);
      let d = "";
      let drawing = false;
      for (const f of sess.frames) {
        const val = f.angles[selectedJoint][selectedSide];
        if (val === null) {
          drawing = false;
          continue;
        }
        const pct = Math.min(1, Math.max(0, f.timestampSec / dur));
        const x = (padL + pct * plotW).toFixed(1);
        const y = (padT + plotH - (Math.min(185, Math.max(0, val)) / 185) * plotH).toFixed(1);
        d += drawing ? ` L ${x} ${y}` : ` M ${x} ${y}`;
        drawing = true;
      }
      return d.trim();
    };

    return {
      width,
      height,
      padL,
      padR,
      padT,
      padB,
      plotW,
      plotH,
      pathA: buildPath(sessionA),
      pathB: buildPath(sessionB),
    };
  }, [sessionA, sessionB, selectedJoint, selectedSide]);

  if (sessions.length === 0) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-16">
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-xl mx-auto">
          <h2 className="text-xl font-bold text-[#0B1F3A]">저장된 시뮬레이션 기록이 없습니다</h2>
          <p className="text-sm text-slate-600 mt-2">
            동작 시뮬레이션 화면에서 원하는 스포츠 동작을 실행하고 저장하면 기록이 누적되며, 서로 다른 자세 조건의 ROM과 각도를 비교할 수 있습니다.
          </p>
          <button
            type="button"
            onClick={onStartSimulation}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#132F56] rounded-lg cursor-pointer"
          >
            <Play className="w-4 h-4" />
            <span>첫 시뮬레이션 시작하기</span>
          </button>
        </div>
      </div>
    );
  }

  const ComparisonPanel = (
    <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-bold text-[#0B1F3A] flex items-center gap-2">
            <ArrowLeftRight className="w-5 h-5 text-blue-700" />
            <span>시뮬레이션 기록 비교 분석</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            두 개의 시뮬레이션 세션을 선택하여 진행률(0~100%)별 관절 각도와 ROM 변화를 비교합니다.
          </p>
        </div>

        {sessions.length >= 2 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full lg:w-auto">
            <label className="block text-xs">
              <span className="font-semibold text-[#0B1F3A] block mb-1">기준 기록 A (실선)</span>
              <select
                value={sessionA?.id ?? ""}
                onChange={(e) => onSelectCompareA(e.target.value)}
                className="w-full sm:w-60 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} · {new Date(s.createdAt).toLocaleDateString("ko-KR")}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs">
              <span className="font-semibold text-cyan-700 block mb-1">비교 기록 B (점선)</span>
              <select
                value={sessionB?.id ?? ""}
                onChange={(e) => onSelectCompareB(e.target.value)}
                className="w-full sm:w-60 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} · {new Date(s.createdAt).toLocaleDateString("ko-KR")}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
      </div>

      {sessions.length < 2 ? (
        <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-2">
          <p className="text-sm font-semibold text-[#0B1F3A]">
            기록 비교를 위해 2개 이상의 시뮬레이션 기록이 필요합니다
          </p>
          <p className="text-xs text-slate-500">
            다른 자세 조건(예: 상체 전경 편차 또는 좌우 불균형 적용)으로 한 번 더 시뮬레이션을 저장하면 비교가 가능합니다.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {COMPARE_JOINTS.map((j) => (
                <button
                  key={j}
                  type="button"
                  onClick={() => setSelectedJoint(j)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                    selectedJoint === j
                      ? "bg-[#0B1F3A] text-white border-[#0B1F3A]"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {JOINT_META[j].labelKo}
                </button>
              ))}
            </div>

            <div className="inline-flex p-0.5 bg-slate-100 border border-slate-200 rounded-lg">
              {(["left", "right"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setSelectedSide(side)}
                  className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                    selectedSide === side
                      ? "bg-white text-[#0B1F3A] font-semibold"
                      : "text-slate-600"
                  }`}
                >
                  {side === "left" ? "좌측" : "우측"}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <div className="flex flex-wrap items-center gap-5 text-xs mb-3">
              <span className="inline-flex items-center gap-2 font-semibold text-[#0B1F3A]">
                <span className="w-5 h-0.5 bg-[#0B1F3A] inline-block" />
                <span>기록 A: {sessionA?.title}</span>
              </span>
              <span className="inline-flex items-center gap-2 font-semibold text-cyan-700">
                <span className="w-5 h-0.5 border-t-2 border-dashed border-cyan-600 inline-block" />
                <span>기록 B: {sessionB?.title}</span>
              </span>
            </div>

            <svg
              viewBox={`0 0 ${comparisonChart.width} ${comparisonChart.height}`}
              className="w-full h-auto"
              role="img"
              aria-label="두 시뮬레이션 관절 각도 비교 그래프"
            >
              {[0, 45, 90, 135, 180].map((deg) => {
                const y =
                  comparisonChart.padT +
                  comparisonChart.plotH -
                  (deg / 185) * comparisonChart.plotH;
                return (
                  <g key={deg}>
                    <line
                      x1={comparisonChart.padL}
                      y1={y}
                      x2={comparisonChart.width - comparisonChart.padR}
                      y2={y}
                      stroke="#E2E8F0"
                      strokeWidth={1}
                    />
                    <text
                      x={comparisonChart.padL - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 text-[11px] font-mono"
                    >
                      {deg}°
                    </text>
                  </g>
                );
              })}

              {[0, 25, 50, 75, 100].map((pct) => {
                const x = comparisonChart.padL + (pct / 100) * comparisonChart.plotW;
                return (
                  <text
                    key={pct}
                    x={x}
                    y={comparisonChart.height - 8}
                    textAnchor="middle"
                    className="fill-slate-500 text-[11px] font-mono"
                  >
                    {pct}%
                  </text>
                );
              })}

              {comparisonChart.pathA && (
                <path
                  d={comparisonChart.pathA}
                  fill="none"
                  stroke="#0B1F3A"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              )}
              {comparisonChart.pathB && (
                <path
                  d={comparisonChart.pathB}
                  fill="none"
                  stroke="#0891B2"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  strokeLinejoin="round"
                />
              )}
            </svg>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">관절</th>
                  <th className="py-3 px-4 text-right">기록 A 좌 ROM</th>
                  <th className="py-3 px-4 text-right">기록 B 좌 ROM</th>
                  <th className="py-3 px-4 text-right">좌측 변화(Δ)</th>
                  <th className="py-3 px-4 text-right">기록 A 우 ROM</th>
                  <th className="py-3 px-4 text-right">기록 B 우 ROM</th>
                  <th className="py-3 px-4 text-right">비대칭 비교(A → B)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                {COMPARE_JOINTS.map((joint) => {
                  const sA = sessionA?.summary.find((x) => x.joint === joint);
                  const sB = sessionB?.summary.find((x) => x.joint === joint);
                  const deltaL =
                    sA?.leftRom !== null &&
                    sA?.leftRom !== undefined &&
                    sB?.leftRom !== null &&
                    sB?.leftRom !== undefined
                      ? sB.leftRom - sA.leftRom
                      : null;

                  return (
                    <tr key={joint} className="bg-white hover:bg-slate-50/70">
                      <td className="py-3 px-4 font-sans font-semibold text-[#0B1F3A]">
                        {JOINT_META[joint].labelKo}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-700">
                        {sA?.leftRom !== null && sA?.leftRom !== undefined
                          ? `${sA.leftRom.toFixed(1)}°`
                          : "-"}
                      </td>
                      <td className="py-3 px-4 text-right text-cyan-700 font-semibold">
                        {sB?.leftRom !== null && sB?.leftRom !== undefined
                          ? `${sB.leftRom.toFixed(1)}°`
                          : "-"}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-semibold ${
                          deltaL === null
                            ? "text-slate-400"
                            : deltaL >= 0
                              ? "text-emerald-700"
                              : "text-amber-700"
                        }`}
                      >
                        {deltaL !== null ? `${deltaL >= 0 ? "+" : ""}${deltaL.toFixed(1)}°` : "-"}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-700">
                        {sA?.rightRom !== null && sA?.rightRom !== undefined
                          ? `${sA.rightRom.toFixed(1)}°`
                          : "-"}
                      </td>
                      <td className="py-3 px-4 text-right text-cyan-700 font-semibold">
                        {sB?.rightRom !== null && sB?.rightRom !== undefined
                          ? `${sB.rightRom.toFixed(1)}°`
                          : "-"}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-700">
                        {sA?.asymmetryDeg !== null && sA?.asymmetryDeg !== undefined
                          ? `${sA.asymmetryDeg.toFixed(1)}°`
                          : "-"}{" "}
                        →{" "}
                        {sB?.asymmetryDeg !== null && sB?.asymmetryDeg !== undefined
                          ? `${sB.asymmetryDeg.toFixed(1)}°`
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );

  const HistoryTablePanel = (
    <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h2 className="text-lg font-bold text-[#0B1F3A]">저장된 시뮬레이션 기록 ({sessions.length}건)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            이전 시뮬레이션 파라미터, 관절 시계열 데이터, AI 리포트를 다시 열람하거나 비교 대상으로 지정할 수 있습니다.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="운동 종목 또는 시나리오 검색..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-[#0B1F3A]"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
              <th className="py-3 pr-3">분석 일시</th>
              <th className="py-3 px-3">동작 · 설정 요약</th>
              <th className="py-3 px-3 text-right">길이</th>
              <th className="py-3 px-3 text-right">무릎 ROM</th>
              <th className="py-3 px-3 text-right">골반 ROM</th>
              <th className="py-3 pl-3 text-right">작업</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {filteredSessions.map((s) => {
              const knee = s.summary.find((x) => x.joint === "knee");
              const hip = s.summary.find((x) => x.joint === "hip");
              const isA = sessionA?.id === s.id;
              const isB = sessionB?.id === s.id;

              return (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="py-3.5 pr-3 text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleString("ko-KR", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="flex items-center gap-3">
                      {s.thumbnailDataUrl && (
                        <img
                          src={s.thumbnailDataUrl}
                          alt={s.title}
                          className="w-12 h-8 object-cover rounded border border-slate-200 shrink-0"
                        />
                      )}
                      <div>
                        <p className="font-semibold text-[#0B1F3A]">{s.title}</p>
                        <p className="text-xs text-slate-500 font-mono tabular-nums">
                          깊이 {s.simulationParams?.depthPct ?? "-"}% · 상체 편차 +
                          {s.simulationParams?.trunkLeanBiasDeg ?? 0}° · 비대칭{" "}
                          {s.simulationParams?.asymmetryPct ?? 0}%
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono tabular-nums text-xs text-slate-700">
                    {s.durationSec.toFixed(1)}s
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono tabular-nums text-xs text-slate-700">
                    {knee?.leftRom ?? knee?.rightRom ?? "-"}°
                  </td>
                  <td className="py-3.5 px-3 text-right font-mono tabular-nums text-xs text-slate-700">
                    {hip?.leftRom ?? hip?.rightRom ?? "-"}°
                  </td>
                  <td className="py-3.5 pl-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenSession(s)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#132F56] rounded-md cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>열기</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectCompareA(s.id)}
                        className={`px-2 py-1.5 text-xs font-semibold rounded-md border cursor-pointer ${
                          isA
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        A
                      </button>
                      <button
                        type="button"
                        onClick={() => onSelectCompareB(s.id)}
                        className={`px-2 py-1.5 text-xs font-semibold rounded-md border cursor-pointer ${
                          isB
                            ? "bg-cyan-700 text-white border-cyan-700"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        B
                      </button>

                      {confirmDeleteId === s.id ? (
                        <button
                          type="button"
                          onClick={() => {
                            onDeleteSession(s.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md cursor-pointer"
                        >
                          삭제 확인
                        </button>
                      ) : (
                        <button
                          type="button"
                          aria-label="기록 삭제"
                          onClick={() => setConfirmDeleteId(s.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8 space-y-8 pb-16">
      {mode === "compare" ? (
        <>
          {ComparisonPanel}
          {HistoryTablePanel}
        </>
      ) : (
        <>
          {HistoryTablePanel}
          {ComparisonPanel}
        </>
      )}
    </div>
  );
};
