import React, { useEffect, useRef } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Clock,
  Play,
  SlidersHorizontal,
  Sparkles,
} from "lucide-react";
import {
  type AnalysisSession,
  MOVEMENT_PRESETS,
  type MovementPresetId,
} from "../types/biomechanics";
import { computeSimulatedFrame, drawSimulationStage } from "../utils/simulationEngine";

interface HomeViewProps {
  selectedPresetId: MovementPresetId;
  onSelectPreset: (id: MovementPresetId) => void;
  onLaunchSimulation: (presetId: MovementPresetId) => void;
  sessions: AnalysisSession[];
  onOpenSession: (session: AnalysisSession) => void;
  onCompareSession: (session: AnalysisSession) => void;
  onGoHistory: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  selectedPresetId,
  onSelectPreset,
  onLaunchSimulation,
  sessions,
  onOpenSession,
  onCompareSession,
  onGoHistory,
}) => {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const selectedPreset =
    MOVEMENT_PRESETS.find((p) => p.id === selectedPresetId) ?? MOVEMENT_PRESETS[0];

  // Live animated preview of the selected sport movement right on the Home stage
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    let rafId = 0;
    const startMs = performance.now();

    const renderLoop = (nowMs: number) => {
      const elapsedSec = (nowMs - startMs) / 1000;
      const frame = computeSimulatedFrame(selectedPreset.defaultParams, elapsedSec);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        drawSimulationStage(ctx, canvas.width, canvas.height, frame, {
          showSkeleton: true,
          showAngles: true,
          showComLine: true,
          sideFilter: "both",
          presetId: selectedPreset.id,
        });
      }
      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafId);
  }, [selectedPreset]);

  const recentSessions = sessions.slice(0, 4);

  return (
    <div className="space-y-12 pb-16">
      {/* Hero & Live Simulation Preview Split */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 py-10 lg:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
            {/* Left Column: Headline + Sport Simulation Launcher */}
            <div className="lg:col-span-6 flex flex-col justify-between gap-6">
              <div className="space-y-4">
                <p className="text-xs font-semibold tracking-wider text-blue-700">
                  스포츠공학 생체역학 · 실시간 운동학 시뮬레이션
                </p>
                <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-[#0B1F3A] text-balance leading-[1.15]">
                  AI 스포츠 동작 분석
                </h1>
                <p className="text-base text-slate-600 max-w-2xl leading-relaxed">
                  별도의 영상 촬영 없이도 종목별 동작 시뮬레이션을 실행하고 가동 깊이, 상체 기울기,
                  좌우 비대칭 파라미터를 조절하며 어깨·팔꿈치·손목·골반·무릎·발목 관절 각도와 AI 개선 가이드를 즉시 확인할 수 있습니다.
                </p>
              </div>

              {/* Sport Preset Selector */}
              <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-xl p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#0B1F3A]">
                    시뮬레이션 종목 선택
                  </span>
                  <span className="text-xs text-slate-500">{selectedPreset.viewLabel}</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {MOVEMENT_PRESETS.map((preset) => {
                    const active = preset.id === selectedPresetId;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onSelectPreset(preset.id)}
                        className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          active
                            ? "bg-[#0B1F3A] text-white border-[#0B1F3A]"
                            : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {preset.nameKo}
                      </button>
                    );
                  })}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed pt-1">
                  {selectedPreset.description}
                </p>

                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => onLaunchSimulation(selectedPreset.id)}
                    className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#132F56] rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>{selectedPreset.nameKo} 시뮬레이션 실행 및 분석</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Live Interactive Canvas Preview */}
            <div className="lg:col-span-6 flex flex-col">
              <div className="relative w-full h-full min-h-[300px] rounded-xl overflow-hidden border border-slate-200 bg-[#09182E] flex flex-col justify-between">
                <canvas
                  ref={previewCanvasRef}
                  width={960}
                  height={540}
                  className="w-full h-full object-contain"
                />
                <div className="px-5 py-3 bg-[#071324] border-t border-slate-800 flex items-center justify-between gap-4 text-xs text-slate-300">
                  <span className="font-semibold text-white">
                    실시간 운동학 프리뷰 · {selectedPreset.nameKo}
                  </span>
                  <span className="font-mono text-cyan-300">
                    33개 관절 랜드마크 · 6대 관절 실시간 각도
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Analysis Features (4 Cards) */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-[#0B1F3A]">주요 시뮬레이션 & 분석 기능</h2>
          <p className="text-sm text-slate-500 mt-1">
            순운동학(Forward Kinematics) 모델 기반의 실시간 골격 시뮬레이션과 AI 자세 교정 분석을 제공합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4">
            <div className="w-10 h-10 rounded-lg bg-slate-100 text-[#0B1F3A] flex items-center justify-center">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B1F3A]">자세 파라미터 시뮬레이션</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                동작 깊이, 상체 전경 각도, 좌우 비대칭, 반복 속도를 조절하며 다양한 운동 자세 시나리오를 즉시 재현합니다.
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4">
            <div className="w-10 h-10 rounded-lg bg-slate-100 text-[#0B1F3A] flex items-center justify-center">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B1F3A]">6대 관절 각도 계측</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                어깨, 팔꿈치, 손목, 골반, 무릎, 발목의 좌·우 각도와 가동범위(ROM), 무게중심선을 실시간 계산합니다.
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4">
            <div className="w-10 h-10 rounded-lg bg-slate-100 text-[#0B1F3A] flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B1F3A]">AI 자세 진단 및 교정</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                시뮬레이션에서 계측된 각도 통계와 키프레임을 AI가 분석해 자세 특징과 교정 드릴을 안내합니다.
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between gap-4">
            <div className="w-10 h-10 rounded-lg bg-slate-100 text-[#0B1F3A] flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0B1F3A]">시계열 그래프 · 기록 비교</h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                표준 폼과 비대칭 시뮬레이션 결과를 각각 저장해 두 세션의 관절 각도 곡선과 ROM 차이를 비교합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Lab Showcase Card */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-5 min-h-[220px] bg-slate-100">
            <img
              src="/src/assets/images/hero_sports_biomechanics_1795142365009.jpg"
              alt="스포츠공학 생체역학 모션 분석 실험실"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center gap-4">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-blue-700">생체역학 시뮬레이션 연구 워크플로우</p>
              <h2 className="text-xl font-bold text-[#0B1F3A]">
                이상적 자세 vs 불균형 자세를 직접 실험하고 비교하세요
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                시뮬레이션 스튜디오에서 상체 전경 편향이나 좌우 비대칭 슬라이더를 변경하면
                실시간으로 관절 각도와 무게중심 위치가 어떻게 달라지는지 시각적으로 확인할 수 있습니다.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
              <div>
                <p className="font-semibold text-[#0B1F3A]">상지 관절</p>
                <p className="text-slate-500 mt-0.5">어깨 · 팔꿈치 · 손목 각도</p>
              </div>
              <div>
                <p className="font-semibold text-[#0B1F3A]">하지 관절</p>
                <p className="text-slate-500 mt-0.5">골반 · 무릎 · 발목 각도</p>
              </div>
              <div>
                <p className="font-semibold text-[#0B1F3A]">체간 & 대칭성</p>
                <p className="text-slate-500 mt-0.5">상체 전경각 · 무게중심(COM)</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Simulation Records */}
      <section className="max-w-[1440px] mx-auto px-4 sm:px-8">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-[#0B1F3A]">최근 분석 기록</h2>
            <p className="text-sm text-slate-500 mt-1">
              저장된 시뮬레이션 분석 결과를 다시 열거나 두 시나리오를 비교할 수 있습니다.
            </p>
          </div>
          {sessions.length > 0 && (
            <button
              type="button"
              onClick={onGoHistory}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A] hover:text-blue-700 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <span>전체 기록 보기</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>

        {recentSessions.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-[#0B1F3A]">저장된 시뮬레이션 기록이 아직 없습니다</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
              종목을 선택하고 시뮬레이션을 실행한 뒤 ‘AI 분석 및 기록 저장’을 누르면 결과가 이곳에 보관됩니다.
            </p>
            <button
              type="button"
              onClick={() => onLaunchSimulation(selectedPreset.id)}
              className="mt-5 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#132F56] rounded-lg cursor-pointer"
            >
              <Play className="w-4 h-4" />
              <span>첫 시뮬레이션 실행하기</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {recentSessions.map((session) => {
              const knee = session.summary.find((s) => s.joint === "knee");
              const hip = session.summary.find((s) => s.joint === "hip");
              const dateStr = new Date(session.createdAt).toLocaleDateString("ko-KR", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={session.id}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between"
                >
                  <div>
                    <div className="aspect-video bg-[#09182E] relative overflow-hidden">
                      {session.thumbnailDataUrl ? (
                        <img
                          src={session.thumbnailDataUrl}
                          alt={session.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                          미리보기 없음
                        </div>
                      )}
                    </div>
                    <div className="p-4 space-y-2">
                      <p className="text-xs text-slate-500 font-mono tabular-nums">
                        {dateStr} · {session.durationSec.toFixed(1)}초
                      </p>
                      <h3 className="text-base font-bold text-[#0B1F3A] truncate">
                        {session.title}
                      </h3>
                      <p className="text-xs text-slate-600 font-mono tabular-nums">
                        무릎 ROM {knee?.leftRom ?? knee?.rightRom ?? "-"}° · 골반 ROM{" "}
                        {hip?.leftRom ?? hip?.rightRom ?? "-"}°
                      </p>
                    </div>
                  </div>

                  <div className="px-4 pb-4 pt-2 border-t border-slate-100 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenSession(session)}
                      className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-[#0B1F3A] hover:bg-[#132F56] rounded-lg transition-colors cursor-pointer"
                    >
                      결과 보기
                    </button>
                    <button
                      type="button"
                      onClick={() => onCompareSession(session)}
                      className="py-2 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                    >
                      비교
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
