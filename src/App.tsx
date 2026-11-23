import React, { useEffect, useState } from "react";
import { AnalysisView } from "./components/AnalysisView";
import { HistoryCompareView } from "./components/HistoryCompareView";
import { HomeView } from "./components/HomeView";
import { type AppTab, TopNav } from "./components/TopNav";
import {
  type AnalysisSession,
  MOVEMENT_PRESETS,
  type MovementPresetId,
  type SimulationParams,
} from "./types/biomechanics";
import { requestAiBiomechanicsReport } from "./utils/apiClient";
import {
  deleteAnalysisSession,
  listAnalysisSessions,
  saveAnalysisSession,
} from "./utils/sessionStorage";
import { generateSimulationDataset } from "./utils/simulationEngine";

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [selectedPresetId, setSelectedPresetId] = useState<MovementPresetId>("squat");
  const [simParams, setSimParams] = useState<SimulationParams>(
    MOVEMENT_PRESETS[0].defaultParams
  );

  const [sessions, setSessions] = useState<AnalysisSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [compareAId, setCompareAId] = useState<string | null>(null);
  const [compareBId, setCompareBId] = useState<string | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);

  // Load saved simulation records from IndexedDB on mount
  useEffect(() => {
    listAnalysisSessions()
      .then((loaded) => {
        setSessions(loaded);
        if (loaded.length > 0) {
          setActiveSessionId(loaded[0].id);
          setCompareAId(loaded[0].id);
          if (loaded.length > 1) {
            setCompareBId(loaded[1].id);
          }
        }
      })
      .catch((err) => {
        console.error("Failed to load IndexedDB sessions:", err);
      });
  }, []);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? null;

  const generateAndSaveReport = async (session: AnalysisSession) => {
    setIsLoadingReport(true);
    try {
      const report = await requestAiBiomechanicsReport({
        exerciseType: `${session.exerciseType} (깊이 ${session.simulationParams.depthPct}%, 상체편차 +${session.simulationParams.trunkLeanBiasDeg}°, 좌우비대칭 ${session.simulationParams.asymmetryPct}%)`,
        fileName: `simulation-${session.simulationParams.presetId}.sim`,
        durationSec: session.durationSec,
        framesDetected: session.framesDetected,
        totalFramesSampled: session.totalFramesSampled,
        avgTrunkLean: session.avgTrunkLean,
        summary: session.summary,
        keyframes: session.keyframeImages,
      });

      const updated: AnalysisSession = {
        ...session,
        report,
        reportError: null,
      };

      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      await saveAnalysisSession(updated).catch((err) =>
        console.error("Failed to update session with AI report:", err)
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "AI 자세 분석 요청 중 오류가 발생했습니다.";
      const failed: AnalysisSession = {
        ...session,
        reportError: msg,
      };
      setSessions((prev) => prev.map((s) => (s.id === failed.id ? failed : s)));
      await saveAnalysisSession(failed).catch(() => {});
    } finally {
      setIsLoadingReport(false);
    }
  };

  const handleRunAndSaveSimulation = async (params: SimulationParams) => {
    const dataset = generateSimulationDataset(params);
    const presetMeta =
      MOVEMENT_PRESETS.find((p) => p.id === params.presetId) ?? MOVEMENT_PRESETS[0];

    const labelParts = [presetMeta.nameKo];
    if (params.trunkLeanBiasDeg >= 16) labelParts.push("전경 편차");
    if (params.asymmetryPct >= 14) labelParts.push("좌우 불균형");
    if (params.trunkLeanBiasDeg <= 6 && params.asymmetryPct <= 5) labelParts.push("표준 폼");

    const newSession: AnalysisSession = {
      id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      title: `${labelParts.join(" · ")}`,
      exerciseType: presetMeta.nameKo,
      simulationParams: { ...params },
      durationSec: dataset.durationSec,
      videoWidth: dataset.videoWidth,
      videoHeight: dataset.videoHeight,
      fpsSampled: dataset.fpsSampled,
      framesDetected: dataset.framesDetected,
      totalFramesSampled: dataset.totalFramesSampled,
      frames: dataset.frames,
      summary: dataset.summary,
      avgTrunkLean: dataset.avgTrunkLean,
      thumbnailDataUrl: dataset.thumbnailDataUrl,
      keyframeImages: dataset.keyframeImages,
      report: null,
      reportError: null,
    };

    await saveAnalysisSession(newSession).catch((err) =>
      console.error("Failed to save simulation session:", err)
    );

    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    if (!compareAId) {
      setCompareAId(newSession.id);
    } else {
      setCompareBId(compareAId);
      setCompareAId(newSession.id);
    }

    await generateAndSaveReport(newSession);
  };

  const handleLaunchSimulation = (presetId: MovementPresetId) => {
    const preset = MOVEMENT_PRESETS.find((p) => p.id === presetId) ?? MOVEMENT_PRESETS[0];
    setSelectedPresetId(preset.id);
    setSimParams({ ...preset.defaultParams });
    setActiveTab("simulation");
  };

  const handleDeleteSession = async (id: string) => {
    await deleteAnalysisSession(id).catch((err) => console.error(err));
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (activeSessionId === id) {
        setActiveSessionId(next[0]?.id ?? null);
      }
      if (compareAId === id) {
        setCompareAId(next[0]?.id ?? null);
      }
      if (compareBId === id) {
        setCompareBId(next[1]?.id ?? null);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onStartSimulation={() => handleLaunchSimulation(selectedPresetId)}
      />

      <main className="flex-1">
        {activeTab === "home" && (
          <HomeView
            selectedPresetId={selectedPresetId}
            onSelectPreset={(id) => {
              setSelectedPresetId(id);
              const preset = MOVEMENT_PRESETS.find((p) => p.id === id) ?? MOVEMENT_PRESETS[0];
              setSimParams({ ...preset.defaultParams });
            }}
            onLaunchSimulation={handleLaunchSimulation}
            sessions={sessions}
            onOpenSession={(session) => {
              setActiveSessionId(session.id);
              if (session.simulationParams) {
                setSelectedPresetId(session.simulationParams.presetId);
                setSimParams({ ...session.simulationParams });
              }
              setActiveTab("simulation");
            }}
            onCompareSession={(session) => {
              setCompareAId(session.id);
              setActiveTab("compare");
            }}
            onGoHistory={() => setActiveTab("history")}
          />
        )}

        {activeTab === "simulation" && (
          <AnalysisView
            params={simParams}
            onChangeParams={(next) => {
              setSimParams(next);
              setSelectedPresetId(next.presetId);
            }}
            activeSession={activeSession}
            isLoadingReport={isLoadingReport}
            onRunAndSaveSimulation={handleRunAndSaveSimulation}
            onRetryReport={generateAndSaveReport}
            onCompareSession={(session) => {
              setCompareAId(session.id);
              setActiveTab("compare");
            }}
          />
        )}

        {(activeTab === "compare" || activeTab === "history") && (
          <HistoryCompareView
            mode={activeTab}
            sessions={sessions}
            compareAId={compareAId}
            compareBId={compareBId}
            onSelectCompareA={setCompareAId}
            onSelectCompareB={setCompareBId}
            onOpenSession={(session) => {
              setActiveSessionId(session.id);
              if (session.simulationParams) {
                setSelectedPresetId(session.simulationParams.presetId);
                setSimParams({ ...session.simulationParams });
              }
              setActiveTab("simulation");
            }}
            onDeleteSession={handleDeleteSession}
            onStartSimulation={() => handleLaunchSimulation(selectedPresetId)}
          />
        )}
      </main>

      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <p className="font-semibold text-[#0B1F3A]">SPORTS AI · AI 스포츠 동작 시뮬레이션 플랫폼</p>
          <p>순운동학 관절 시뮬레이션 및 스포츠공학 생체역학 계측 기반</p>
        </div>
      </footer>
    </div>
  );
}
