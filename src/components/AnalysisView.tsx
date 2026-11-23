import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
} from "lucide-react";
import {
  type AnalysisSession,
  type BodySideFilter,
  JOINT_META,
  type JointGroup,
  MOVEMENT_PRESETS,
  type MovementPresetId,
  type SimulationParams,
} from "../types/biomechanics";
import {
  drawSimulationStage,
  findNearestFrame,
  generateSimulationDataset,
} from "../utils/simulationEngine";
import { KinematicChart } from "./KinematicChart";

interface AnalysisViewProps {
  params: SimulationParams;
  onChangeParams: (next: SimulationParams) => void;
  activeSession: AnalysisSession | null;
  isLoadingReport: boolean;
  onRunAndSaveSimulation: (params: SimulationParams, labelOverride?: string) => void;
  onRetryReport: (session: AnalysisSession) => void;
  onCompareSession: (session: AnalysisSession) => void;
}

export const AnalysisView: React.FC<AnalysisViewProps> = ({
  params,
  onChangeParams,
  activeSession,
  isLoadingReport,
  onRunAndSaveSimulation,
  onRetryReport,
  onCompareSession,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [playbackRate, setPlaybackRate] = useState<0.25 | 0.5 | 1>(1);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showAngles, setShowAngles] = useState(true);
  const [showComLine, setShowComLine] = useState(true);
  const [sideFilter, setSideFilter] = useState<BodySideFilter>("both");
  const [activeJoints, setActiveJoints] = useState<JointGroup[]>(["knee", "hip", "ankle"]);

  // Live deterministic simulation dataset recomputed instantaneously whenever parameters change
  const liveDataset = useMemo(() => generateSimulationDataset(params), [params]);

  // Keep currentTimeSec within bounds if duration shrinks
  useEffect(() => {
    setCurrentTimeSec((prev) => (prev > liveDataset.durationSec ? 0 : prev));
  }, [liveDataset.durationSec]);

  const currentFrame = useMemo(
    () => findNearestFrame(liveDataset.frames, currentTimeSec),
    [liveDataset.frames, currentTimeSec]
  );

  // Real-time playback animation loop
  useEffect(() => {
    if (!isPlaying) return;
    let rafId = 0;
    let lastMs = performance.now();

    const tick = (nowMs: number) => {
      const dt = ((nowMs - lastMs) / 1000) * playbackRate;
      lastMs = nowMs;
      setCurrentTimeSec((prev) => {
        const next = prev + dt;
        return next >= liveDataset.durationSec ? 0 : next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, playbackRate, liveDataset.durationSec]);

  // Draw calibrated simulation canvas synced with currentFrame
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return;

    const render = () => {
      const rect = stage.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      drawSimulationStage(ctx, w, h, currentFrame, {
        showSkeleton,
        showAngles,
        showComLine,
        sideFilter,
        presetId: params.presetId,
      });
    };

    render();
    const ro = new ResizeObserver(render);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [currentFrame, showSkeleton, showAngles, showComLine, sideFilter, params.presetId]);

  const handleSelectPreset = (id: MovementPresetId) => {
    const preset = MOVEMENT_PRESETS.find((p) => p.id === id) ?? MOVEMENT_PRESETS[0];
    setCurrentTimeSec(0);
    setIsPlaying(true);
    onChangeParams({ ...preset.defaultParams });
  };

  const applyScenarioModifier = (scenario: "ideal" | "lean" | "asymmetry") => {
    const base = MOVEMENT_PRESETS.find((p) => p.id === params.presetId) ?? MOVEMENT_PRESETS[0];
    if (scenario === "ideal") {
      onChangeParams({
        ...base.defaultParams,
        trunkLeanBiasDeg: 3,
        asymmetryPct: 0,
      });
    } else if (scenario === "lean") {
      onChangeParams({
        ...params,
        trunkLeanBiasDeg: 22,
        asymmetryPct: 4,
      });
    } else {
      onChangeParams({
        ...params,
        trunkLeanBiasDeg: 8,
        asymmetryPct: 22,
      });
    }
  };

  const handleStepFrame = (direction: -1 | 1) => {
    setIsPlaying(false);
    const frames = liveDataset.frames;
    if (frames.length === 0) return;
    let nearestIdx = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < frames.length; i++) {
      const d = Math.abs(frames[i].timestampSec - currentTimeSec);
      if (d < bestDiff) {
        bestDiff = d;
        nearestIdx = i;
      }
    }
    const nextIdx = Math.min(Math.max(0, nearestIdx + direction), frames.length - 1);
    setCurrentTimeSec(frames[nextIdx].timestampSec);
  };

  const handleToggleJoint = (joint: JointGroup) => {
    setActiveJoints((prev) => {
      if (prev.includes(joint)) {
        return prev.length > 1 ? prev.filter((j) => j !== joint) : prev;
      }
      return [...prev, joint];
    });
  };

  const activePresetMeta =
    MOVEMENT_PRESETS.find((p) => p.id === params.presetId) ?? MOVEMENT_PRESETS[0];

  const statusSymbol = (status: string) => {
    if (status === "양호") return "● 양호";
    if (status === "주의") return "▲ 주의";
    return "✖ 개선필요";
  };

  const statusColor = (status: string) => {
    if (status === "양호") return "text-emerald-700";
    if (status === "주의") return "text-amber-700";
    return "text-red-700";
  };

  const paramsMatchSavedSession =
    activeSession &&
    JSON.stringify(activeSession.simulationParams) === JSON.stringify(params);

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-8 space-y-6 pb-16">
      {/* Top Studio Header & Sport Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono tabular-nums">
            <span>{activePresetMeta.viewLabel}</span>
            <span aria-hidden="true">·</span>
            <span>주기 {params.tempoSec.toFixed(1)}초</span>
            <span aria-hidden="true">·</span>
            <span>총 {liveDataset.durationSec.toFixed(2)}초 ({liveDataset.frames.length}프레임)</span>
          </div>
          <h1 className="text-2xl font-extrabold text-[#0B1F3A] tracking-tight">
            {activePresetMeta.nameKo} 생체역학 시뮬레이션
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {MOVEMENT_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => handleSelectPreset(preset.id)}
              className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                params.presetId === preset.id
                  ? "bg-[#0B1F3A] text-white border-[#0B1F3A]"
                  : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
              }`}
            >
              {preset.nameKo}
            </button>
          ))}
        </div>
      </div>

      {/* Main Split: Simulation Viewport + Parameter Deck & Live Telemetry */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Left/Center Interactive Simulation Viewport */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          {/* Overlay Toolbar */}
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSkeleton((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showSkeleton
                    ? "bg-[#0B1F3A] text-white border-[#0B1F3A]"
                    : "bg-white text-slate-600 border-slate-200"
                }`}
              >
                {showSkeleton ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                <span>관절 골격선</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAngles((v) => !v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showAngles
                    ? "bg-[#0B1F3A] text-white border-[#0B1F3A]"
                    : "bg-white text-slate-600 border-slate-200"
                }`}
              >
                실시간 각도 수치
              </button>

              <button
                type="button"
                onClick={() => setShowComLine((v) => !v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showComLine
                    ? "bg-[#0B1F3A] text-white border-[#0B1F3A]"
                    : "bg-white text-slate-600 border-slate-200"
                }`}
              >
                무게중심선
              </button>
            </div>

            <div className="inline-flex items-center p-0.5 bg-slate-200/70 rounded-lg">
              {(
                [
                  { id: "both", label: "양측" },
                  { id: "left", label: "좌측(파랑)" },
                  { id: "right", label: "우측(청록)" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSideFilter(opt.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    sideFilter === opt.id
                      ? "bg-white text-[#0B1F3A] font-semibold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Simulation Canvas Stage */}
          <div
            ref={stageRef}
            onClick={() => setIsPlaying((p) => !p)}
            className="relative w-full aspect-video bg-[#09182E] cursor-pointer overflow-hidden"
          >
            <canvas ref={canvasRef} className="w-full h-full block" />
          </div>

          {/* Playback & Frame Controls */}
          <div className="p-4 border-t border-slate-200 bg-white space-y-3">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                aria-label={isPlaying ? "일시정지" : "재생"}
                className="w-10 h-10 rounded-lg bg-[#0B1F3A] hover:bg-[#132F56] text-white flex items-center justify-center shrink-0 cursor-pointer"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentTimeSec(0);
                }}
                aria-label="처음으로 초기화"
                title="처음으로 초기화"
                className="p-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleStepFrame(-1)}
                title="이전 프레임"
                aria-label="이전 프레임"
                className="p-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleStepFrame(1)}
                title="다음 프레임"
                aria-label="다음 프레임"
                className="p-2.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

              <input
                type="range"
                min={0}
                max={liveDataset.durationSec}
                step={0.01}
                value={Math.min(currentTimeSec, liveDataset.durationSec)}
                onChange={(e) => {
                  setIsPlaying(false);
                  setCurrentTimeSec(Number(e.target.value));
                }}
                aria-label="시뮬레이션 타임라인"
                className="flex-1 accent-[#0B1F3A] cursor-pointer"
              />

              <span className="text-xs font-mono tabular-nums text-slate-700 whitespace-nowrap shrink-0">
                {currentTimeSec.toFixed(2)}s / {liveDataset.durationSec.toFixed(2)}s
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="font-mono tabular-nums">
                실시간 상체 전경 각도:{" "}
                <strong className="text-[#0B1F3A]">
                  {currentFrame?.trunkLean !== null && currentFrame?.trunkLean !== undefined
                    ? `${currentFrame.trunkLean.toFixed(1)}°`
                    : "-"}
                </strong>
              </span>

              <div className="inline-flex items-center gap-1">
                <span className="mr-1 text-slate-500">시뮬레이션 배속:</span>
                {([0.25, 0.5, 1] as const).map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => setPlaybackRate(rate)}
                    className={`px-2 py-1 rounded text-xs font-mono cursor-pointer ${
                      playbackRate === rate
                        ? "bg-[#0B1F3A] text-white font-semibold"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Parameter Sliders Control Deck */}
          <div className="p-5 border-t border-slate-200 bg-slate-50 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#0B1F3A]">생체역학 시뮬레이션 변수 조절</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => applyScenarioModifier("ideal")}
                  className="px-2.5 py-1 text-xs font-medium bg-white border border-slate-200 hover:border-[#0B1F3A] rounded-md text-slate-700 cursor-pointer"
                >
                  표준 이상적 폼
                </button>
                <button
                  type="button"
                  onClick={() => applyScenarioModifier("lean")}
                  className="px-2.5 py-1 text-xs font-medium bg-white border border-slate-200 hover:border-[#0B1F3A] rounded-md text-slate-700 cursor-pointer"
                >
                  상체 과다 전경
                </button>
                <button
                  type="button"
                  onClick={() => applyScenarioModifier("asymmetry")}
                  className="px-2.5 py-1 text-xs font-medium bg-white border border-slate-200 hover:border-[#0B1F3A] rounded-md text-slate-700 cursor-pointer"
                >
                  좌우 불균형
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-700">동작 깊이 / 가동 강도</span>
                  <span className="font-mono tabular-nums font-bold text-[#0B1F3A]">
                    {params.depthPct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={45}
                  max={110}
                  step={1}
                  value={params.depthPct}
                  onChange={(e) =>
                    onChangeParams({ ...params, depthPct: Number(e.target.value) })
                  }
                  className="w-full accent-[#0B1F3A] cursor-pointer"
                />
              </label>

              <label className="block space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-700">상체 전경 편차</span>
                  <span className="font-mono tabular-nums font-bold text-[#0B1F3A]">
                    +{params.trunkLeanBiasDeg}°
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={25}
                  step={1}
                  value={params.trunkLeanBiasDeg}
                  onChange={(e) =>
                    onChangeParams({ ...params, trunkLeanBiasDeg: Number(e.target.value) })
                  }
                  className="w-full accent-[#0B1F3A] cursor-pointer"
                />
              </label>

              <label className="block space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-700">좌우 비대칭 오프셋</span>
                  <span className="font-mono tabular-nums font-bold text-[#0B1F3A]">
                    {params.asymmetryPct}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={25}
                  step={1}
                  value={params.asymmetryPct}
                  onChange={(e) =>
                    onChangeParams({ ...params, asymmetryPct: Number(e.target.value) })
                  }
                  className="w-full accent-[#0B1F3A] cursor-pointer"
                />
              </label>

              <label className="block space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-slate-700">1회 반복 템포</span>
                  <span className="font-mono tabular-nums font-bold text-[#0B1F3A]">
                    {params.tempoSec.toFixed(1)}초
                  </span>
                </div>
                <input
                  type="range"
                  min={0.9}
                  max={4.0}
                  step={0.1}
                  value={params.tempoSec}
                  onChange={(e) =>
                    onChangeParams({ ...params, tempoSec: Number(e.target.value) })
                  }
                  className="w-full accent-[#0B1F3A] cursor-pointer"
                />
              </label>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                현재 설정된 시뮬레이션 데이터를 저장하고 AI 자세 진단을 실행합니다.
              </p>
              <button
                type="button"
                disabled={isLoadingReport}
                onClick={() => onRunAndSaveSimulation(params)}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {isLoadingReport ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                <span>현재 시뮬레이션 AI 분석 및 저장</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Live 6-Joint Angle & ROM Telemetry */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col justify-between gap-5">
          <div>
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-[#0B1F3A]">6대 주요 관절 실시간 각도 & ROM</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  시뮬레이션 관절 좌표에서 기하학적으로 산출되는 실시간 수치
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[11px] text-slate-400 font-medium">평균 상체 기울기</p>
                <p className="text-lg font-bold font-mono tabular-nums text-[#0B1F3A]">
                  {liveDataset.avgTrunkLean !== null ? `${liveDataset.avgTrunkLean.toFixed(1)}°` : "-"}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                    <th className="py-2.5 pr-2">관절</th>
                    <th className="py-2.5 px-2 text-right">현재 좌</th>
                    <th className="py-2.5 px-2 text-right">현재 우</th>
                    <th className="py-2.5 px-2 text-right">좌 ROM</th>
                    <th className="py-2.5 px-2 text-right">우 ROM</th>
                    <th className="py-2.5 pl-2 text-right">좌우 차</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {liveDataset.summary.map((item) => {
                    const liveL = currentFrame?.angles[item.joint].left ?? null;
                    const liveR = currentFrame?.angles[item.joint].right ?? null;
                    return (
                      <tr key={item.joint} className="hover:bg-slate-50/80">
                        <td className="py-3 pr-2">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: JOINT_META[item.joint].colorLeft }}
                            />
                            <div>
                              <p className="font-semibold text-[#0B1F3A]">{item.labelKo}</p>
                              <p className="text-[11px] text-slate-400">
                                {JOINT_META[item.joint].description}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums font-semibold text-blue-700">
                          {liveL !== null ? `${liveL.toFixed(1)}°` : "-"}
                        </td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums font-semibold text-cyan-700">
                          {liveR !== null ? `${liveR.toFixed(1)}°` : "-"}
                        </td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums text-slate-700">
                          {item.leftRom !== null ? `${item.leftRom.toFixed(1)}°` : "-"}
                        </td>
                        <td className="py-3 px-2 text-right font-mono tabular-nums text-slate-700">
                          {item.rightRom !== null ? `${item.rightRom.toFixed(1)}°` : "-"}
                        </td>
                        <td className="py-3 pl-2 text-right font-mono tabular-nums text-slate-600">
                          {item.asymmetryDeg !== null ? `${item.asymmetryDeg.toFixed(1)}°` : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Keyframes Jump Strip */}
          {liveDataset.keyframeImages.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <p className="text-xs font-semibold text-slate-700 mb-2.5">
                핵심 구간 스냅샷 (클릭 시 해당 시점 이동)
              </p>
              <div className="grid grid-cols-3 gap-2.5">
                {liveDataset.keyframeImages.map((kf, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentTimeSec(kf.timestampSec);
                    }}
                    className="group text-left border border-slate-200 hover:border-[#0B1F3A] rounded-lg overflow-hidden bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="aspect-video bg-[#09182E] overflow-hidden">
                      <img
                        src={kf.dataUrl}
                        alt={kf.label}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-150"
                      />
                    </div>
                    <div className="p-2">
                      <p className="text-[11px] font-semibold text-[#0B1F3A] truncate">{kf.label}</p>
                      <p className="text-[11px] font-mono tabular-nums text-slate-500">
                        {kf.timestampSec.toFixed(2)}s
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Time-Series Angle Graph */}
      <KinematicChart
        frames={liveDataset.frames}
        durationSec={liveDataset.durationSec}
        currentTimeSec={currentTimeSec}
        onSeek={(t) => {
          setIsPlaying(false);
          setCurrentTimeSec(t);
        }}
        activeJoints={activeJoints}
        onToggleJoint={handleToggleJoint}
        sideFilter={sideFilter}
        onChangeSide={setSideFilter}
      />

      {/* AI Biomechanical Diagnosis & Improvement Panel */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-[#0B1F3A]">
              AI 스포츠공학 자세 분석 및 개선 가이드
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {activeSession
                ? `최근 저장된 세션(${activeSession.title}) 기준 · 파라미터를 변경했다면 ‘현재 시뮬레이션 AI 분석 및 저장’을 눌러 새 진단을 받으세요.`
                : "현재 시뮬레이션의 6대 관절 각도 통계와 키프레임을 기반으로 AI 전문 진단을 생성합니다."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {activeSession && (
              <button
                type="button"
                onClick={() => onCompareSession(activeSession)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0B1F3A] bg-slate-100 hover:bg-slate-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>기록 비교로 이동</span>
              </button>
            )}
            <button
              type="button"
              disabled={isLoadingReport}
              onClick={() => {
                if (activeSession && paramsMatchSavedSession) {
                  onRetryReport(activeSession);
                } else {
                  onRunAndSaveSimulation(params);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#132F56] disabled:opacity-50 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingReport ? "animate-spin" : ""}`} />
              <span>{activeSession ? "AI 분석 다시 실행" : "AI 분석 실행 및 저장"}</span>
            </button>
          </div>
        </div>

        {isLoadingReport && (
          <div className="py-10 flex flex-col items-center justify-center gap-3 text-slate-600">
            <Loader2 className="w-7 h-7 text-[#0B1F3A] animate-spin" />
            <p className="text-sm font-semibold text-[#0B1F3A]">
              AI가 시뮬레이션 관절 각도 데이터와 자세 스냅샷을 생체역학적으로 평가하고 있습니다...
            </p>
          </div>
        )}

        {!isLoadingReport && !activeSession && (
          <div className="py-10 text-center space-y-3 bg-slate-50 border border-slate-200 rounded-xl">
            <Sparkles className="w-7 h-7 text-blue-700 mx-auto" />
            <p className="text-sm font-bold text-[#0B1F3A]">
              아직 AI 진단 리포트가 생성되지 않았습니다
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              위 슬라이더로 자세 조건을 맞춘 뒤 ‘현재 시뮬레이션 AI 분석 및 저장’ 버튼을 누르면 관절별 진단과 교정 드릴이 제공됩니다.
            </p>
          </div>
        )}

        {!isLoadingReport && activeSession?.reportError && (
          <div
            role="alert"
            className="p-5 bg-red-50 border border-red-200 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="text-sm text-red-900">
                <p className="font-bold">AI 자세 분석 결과를 불러오지 못했습니다</p>
                <p className="mt-1 text-red-700">{activeSession.reportError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRetryReport(activeSession)}
              className="px-4 py-2 text-xs font-semibold text-white bg-red-700 hover:bg-red-800 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              다시 시도
            </button>
          </div>
        )}

        {!isLoadingReport && activeSession?.report && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-2">
                <p className="text-xs font-semibold text-blue-700">종합 생체역학 소견</p>
                <h3 className="text-lg font-bold text-[#0B1F3A]">
                  {activeSession.report.detectedMovement}
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed">
                  {activeSession.report.overallSummary}
                </p>
              </div>

              <div className="lg:col-span-7 border border-slate-200 rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-bold text-[#0B1F3A]">관찰된 주요 동작 특징</h3>
                <ul className="space-y-2 text-sm text-slate-700">
                  {activeSession.report.postureCharacteristics.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="font-mono text-xs font-bold text-blue-700 mt-0.5 shrink-0">
                        0{idx + 1}.
                      </span>
                      <span className="leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200">
                <h3 className="text-sm font-bold text-[#0B1F3A]">관절별 정밀 평가</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500 bg-white">
                      <th className="py-3 px-4">관절 / 부위</th>
                      <th className="py-3 px-4">상태</th>
                      <th className="py-3 px-4">실측 각도 · ROM</th>
                      <th className="py-3 px-4">관찰 소견</th>
                      <th className="py-3 px-4">교정 포인트</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {activeSession.report.jointEvaluations.map((ev, idx) => (
                      <tr key={idx} className="bg-white hover:bg-slate-50/70">
                        <td className="py-3.5 px-4 font-semibold text-[#0B1F3A] whitespace-nowrap">
                          {ev.jointName} · {ev.side}
                        </td>
                        <td
                          className={`py-3.5 px-4 font-semibold whitespace-nowrap ${statusColor(ev.status)}`}
                        >
                          {statusSymbol(ev.status)}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-xs text-slate-700 whitespace-nowrap">
                          {ev.measuredRom}
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 min-w-[220px]">{ev.finding}</td>
                        <td className="py-3.5 px-4 text-slate-700 min-w-[220px]">
                          {ev.recommendation}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold text-[#0B1F3A]">자세 개선 포인트 및 추천 드릴</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {activeSession.report.improvementPoints.map((pt, idx) => (
                  <div
                    key={idx}
                    className="border border-slate-200 rounded-xl p-5 bg-slate-50/60 flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2">
                      <p className="text-xs font-mono text-slate-500">
                        우선순위: <span className="font-semibold text-[#0B1F3A]">{pt.priority}</span>
                      </p>
                      <h4 className="text-base font-bold text-[#0B1F3A]">{pt.title}</h4>
                      <p className="text-sm text-slate-600 leading-relaxed">{pt.description}</p>
                    </div>
                    <div className="pt-3 border-t border-slate-200">
                      <p className="text-xs font-semibold text-blue-700">추천 교정 드릴</p>
                      <p className="text-xs text-slate-700 mt-1 leading-relaxed">{pt.drill}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
