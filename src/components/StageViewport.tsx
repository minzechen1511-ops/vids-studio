import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, Film, Loader2, Pause, Play, RotateCcw, Trash2 } from 'lucide-react';
import {
  CAMERA_PRESETS,
  getWanModelSpec,
  STARTER_REFERENCES,
  type ReferenceAsset,
  type Wan3AspectRatio,
  type Wan3CompiledJob,
  type Wan3GenerationInput,
} from '../lib/wan3';

export interface RenderMetadata {
  width: number;
  height: number;
  durationSec: number;
  hasAudioTrack: boolean;
  vfxList: string[];
  beatsCount: number;
  cameraId: string;
}

export interface AppliedModelInfo {
  model: string;
  provider: string;
  endpoint: string;
  endpointSource?: string;
  secretUsed: string;
  directorModel?: string | null;
}

export interface HistoryTake {
  id: string;
  createdAt: string;
  status: 'completed' | 'submitted' | 'local-webm' | 'previs-ready';
  videoUrl: string | null;
  thumbnailUrl: string | null;
  input: Wan3GenerationInput;
  job: Wan3CompiledJob;
  renderMeta?: RenderMetadata;
  appliedConfig?: AppliedModelInfo;
}

interface StageViewportProps {
  currentInput: Wan3GenerationInput;
  compiledJob: Wan3CompiledJob;
  activeTake: HistoryTake | null;
  history: HistoryTake[];
  isGenerating: boolean;
  renderProgress: number;
  renderElapsedSec: number;
  renderTotalSec: number;
  statusMessage: string | null;
  generationError: string | null;
  hasWanApiKey: boolean;
  hasLocalWanEndpoint: boolean;
  onSelectTake: (take: HistoryTake) => void;
  onDeleteTake: (id: string) => void;
  onApplyStarter: (starterId: string) => void;
  onClearActiveTake: () => void;
  onCancelRender: () => void;
}

type InspectorTab = 'prompt' | 'payload' | 'history';

function getAspectContainerClass(ratio: Wan3AspectRatio): string {
  switch (ratio) {
    case '9:16':
      return 'aspect-[9/16] max-h-[520px] mx-auto';
    case '3:4':
      return 'aspect-[3/4] max-h-[520px] mx-auto';
    case '1:1':
      return 'aspect-square max-h-[480px] mx-auto';
    case '4:3':
      return 'aspect-[4/3] w-full';
    case '16:9':
    case 'auto':
    default:
      return 'aspect-video w-full';
  }
}

function getAnimationName(animationClass: string): string {
  switch (animationClass) {
    case 'cam-dolly-in':
      return 'cam-dolly-in';
    case 'cam-dolly-out':
      return 'cam-dolly-out';
    case 'cam-dolly-left':
      return 'cam-dolly-left';
    case 'cam-dolly-right':
      return 'cam-dolly-right';
    case 'cam-crane-up':
      return 'cam-crane-up';
    case 'cam-crane-down':
      return 'cam-crane-down';
    case 'cam-orbit':
      return 'cam-orbit';
    case 'cam-handheld':
      return 'cam-handheld';
    case 'cam-crash-zoom':
      return 'cam-crash-zoom';
    case 'cam-dutch':
      return 'cam-dutch';
    case 'cam-fpv':
      return 'cam-fpv';
    default:
      return '';
  }
}

export function StageViewport({
  currentInput,
  compiledJob,
  activeTake,
  history,
  isGenerating,
  renderProgress,
  renderElapsedSec,
  renderTotalSec,
  statusMessage,
  generationError,
  hasWanApiKey,
  hasLocalWanEndpoint,
  onSelectTake,
  onDeleteTake,
  onApplyStarter,
  onClearActiveTake,
  onCancelRender,
}: StageViewportProps) {
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('prompt');
  const [copiedKey, setCopiedKey] = useState<'prompt' | 'cli' | 'json' | null>(null);
  const [isPlayingPrevis, setIsPlayingPrevis] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);

  const previewSource: ReferenceAsset | null =
    currentInput.mediaMode === 'frames'
      ? currentInput.startImage || null
      : currentInput.referenceImages?.[0] || null;

  const endFrameSource: ReferenceAsset | null =
    currentInput.mediaMode === 'frames' ? currentInput.endImage || null : null;

  const effectiveDuration = currentInput.duration === -1 ? 10 : currentInput.duration;
  const activeCamera =
    CAMERA_PRESETS.find((c) => c.id === currentInput.cameraPresetId) || CAMERA_PRESETS[0];
  const animationName = getAnimationName(activeCamera.animationClass);

  useEffect(() => {
    setElapsedSec(0);
  }, [previewSource?.id, currentInput.duration, currentInput.cameraPresetId, activeTake?.id]);

  useEffect(() => {
    if (!isPlayingPrevis || !previewSource || activeTake?.videoUrl) return;
    const interval = window.setInterval(() => {
      setElapsedSec((prev) => {
        const next = prev + 0.1;
        return next >= effectiveDuration ? 0 : Number(next.toFixed(1));
      });
    }, 100);
    return () => window.clearInterval(interval);
  }, [isPlayingPrevis, previewSource, effectiveDuration, activeTake?.videoUrl]);

  async function handleCopy(key: 'prompt' | 'cli' | 'json', text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Ignore clipboard failures in restricted environments
    }
  }

  const displayJob = activeTake ? activeTake.job : compiledJob;
  const displayAspect = activeTake ? activeTake.input.aspectRatio : currentInput.aspectRatio;
  const displaySpec = getWanModelSpec(displayJob.model);
  const displayRes =
    displayJob.parameters.resolution || displayJob.parameters.quality || currentInput.resolution;
  const jsonPayloadString = JSON.stringify(
    {
      model: displayJob.model,
      endpoint:
        (activeTake ? activeTake.input.remoteEndpoint : currentInput.remoteEndpoint) ||
        '(server default)',
      prompt: displayJob.compiledPrompt,
      parameters: displayJob.parameters,
      medias: displayJob.medias,
    },
    null,
    2
  );

  const endOpacity =
    endFrameSource && effectiveDuration > 0
      ? Math.min(1, Math.max(0, elapsedSec / effectiveDuration))
      : 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Main Stage Frame */}
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#12151B]">
        {/* Stage Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#D1D6E0]">
            <span className="font-semibold text-[#F2F4F8]">
              {activeTake?.videoUrl
                ? activeTake.status === 'local-webm'
                  ? 'Local Motion Render (.webm)'
                  : 'Rendered Video Output'
                : 'Camera Motion Pre-vis'}
            </span>
            <span aria-hidden="true" className="text-[#6B7380]">·</span>
            <span className="font-mono text-[#949BA8]">
              {displayJob.model && displayJob.model !== 'custom'
                ? displayJob.model
                : displaySpec?.name || 'Custom Model'}{' '}
              / {String(displayRes)} / {displayAspect}
            </span>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs text-[#949BA8] tabular-nums">
            <span>
              {activeCamera.name} ·{' '}
              {displayJob.parameters.duration === -1
                ? 'Smart (-1)'
                : `${displayJob.parameters.duration}s`}
            </span>
            {activeTake?.videoUrl && (
              <a
                href={activeTake.videoUrl}
                download={`${displayJob.model.replace(/[^a-zA-Z0-9._-]+/g, '-')}-${activeTake.id}.${
                  activeTake.status === 'local-webm' ? 'webm' : 'mp4'
                }`}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#E5A93C]/50 bg-[#E5A93C]/15 px-2.5 py-1 font-sans text-xs font-medium text-[#F5D692] transition-colors hover:bg-[#E5A93C]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Download Video</span>
              </a>
            )}
          </div>
        </div>

        {/* Viewport Canvas */}
        <div className="relative bg-[#080A0D] p-4 sm:p-5">
          {isGenerating && (
            <div
              role="status"
              aria-live="polite"
              className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#E5A93C]/30 bg-[#12151B] px-3.5 py-2.5 text-xs text-[#F2F4F8]"
            >
              <div className="flex items-center gap-2.5">
                <Loader2 className="h-4 w-4 animate-spin text-[#E5A93C]" aria-hidden="true" />
                <span>
                  {currentInput.remoteEndpoint?.trim() ||
                  (currentInput.remoteProvider && currentInput.remoteProvider !== 'auto' && currentInput.remoteProvider !== 'generic') ||
                  hasWanApiKey ||
                  hasLocalWanEndpoint
                    ? `Applying ${currentInput.remoteModelId?.trim() || displaySpec?.name || currentInput.modelId}...`
                    : `Directing & encoding .webm clip (${renderElapsedSec.toFixed(1)}s / ${renderTotalSec.toFixed(1)}s)...`}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[#E5A93C] tabular-nums">{renderProgress}%</span>
                <button
                  type="button"
                  onClick={onCancelRender}
                  className="rounded border border-white/[0.14] bg-[#181C24] px-2 py-0.5 text-[11px] font-medium text-[#D1D6E0] transition-colors hover:border-white/30 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {activeTake?.videoUrl ? (
            <div className="space-y-3">
              <div
                className={`overflow-hidden rounded-lg border border-white/[0.1] bg-black ${getAspectContainerClass(
                  displayAspect
                )}`}
              >
                <video
                  key={activeTake.videoUrl}
                  data-testid="rendered-video-player"
                  src={activeTake.videoUrl}
                  controls
                  autoPlay
                  loop
                  playsInline
                  muted={!activeTake.input.generateAudio}
                  className="h-full w-full object-contain"
                />
              </div>

              {activeTake.appliedConfig && (
                <p
                  data-testid="applied-model-summary"
                  className="px-1 font-mono text-[11px] text-[#E5A93C]"
                >
                  Applied Model: {activeTake.appliedConfig.model} · Provider:{' '}
                  {activeTake.appliedConfig.provider} · Secret:{' '}
                  {activeTake.appliedConfig.secretUsed}
                  {activeTake.appliedConfig.directorModel
                    ? ` · Director: ${activeTake.appliedConfig.directorModel}`
                    : ''}
                </p>
              )}

              {activeTake.renderMeta && (
                <p
                  data-testid="render-meta-summary"
                  className="px-1 font-mono text-[11px] text-[#D1D6E0]"
                >
                  Encoded {activeTake.renderMeta.width}×{activeTake.renderMeta.height} ·{' '}
                  {activeTake.renderMeta.durationSec}s · Audio{' '}
                  {activeTake.renderMeta.hasAudioTrack ? 'ON' : 'OFF'} ·{' '}
                  {activeTake.renderMeta.beatsCount > 1
                    ? `${activeTake.renderMeta.beatsCount} shots`
                    : 'Single shot'}
                  {activeTake.renderMeta.vfxList.length > 0
                    ? ` · Prompt FX: ${activeTake.renderMeta.vfxList.join(', ')}`
                    : ''}
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#949BA8]">
                <span>
                  {activeTake.status === 'local-webm'
                    ? 'Playing script-directed .webm clip (beat-by-beat framing, focal tracking, VFX, and audio). Choose Hugging Face / fal / Replicate / DashScope adapter or enter a Video API Endpoint URL to dispatch neural pixel synthesis.'
                    : 'Playing remote neural video output.'}
                </span>
                <button
                  type="button"
                  onClick={onClearActiveTake}
                  className="text-xs font-medium text-[#E5A93C] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] rounded"
                >
                  Back to Live Pre-vis
                </button>
              </div>
            </div>
          ) : previewSource ? (
            <div className="space-y-3">
              <div
                data-testid="previs-stage"
                className={`relative overflow-hidden rounded-lg border border-white/[0.1] bg-[#0B0D10] ${getAspectContainerClass(
                  displayAspect
                )}`}
              >
                <img
                  src={previewSource.dataUrl}
                  alt={`Preview of ${previewSource.name}`}
                  referrerPolicy="no-referrer"
                  style={
                    animationName && isPlayingPrevis
                      ? {
                          animation: `${animationName} ${effectiveDuration}s ease-in-out infinite`,
                        }
                      : undefined
                  }
                  className="cam-animate h-full w-full object-cover"
                />

                {endFrameSource && (
                  <img
                    src={endFrameSource.dataUrl}
                    alt={`Closing frame ${endFrameSource.name}`}
                    referrerPolicy="no-referrer"
                    style={{ opacity: endOpacity }}
                    className="pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-100"
                  />
                )}

                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 py-3">
                  <div className="flex items-center justify-between gap-4 text-xs text-[#F2F4F8]">
                    <span className="truncate font-medium">
                      {currentInput.prompt.trim() || 'Ready for prompt direction'}
                    </span>
                    <span className="font-mono text-[11px] text-[#D1D6E0] shrink-0 tabular-nums">
                      {elapsedSec.toFixed(1)}s / {effectiveDuration.toFixed(1)}s
                    </span>
                  </div>
                </div>
              </div>

              {/* Pre-vis Transport Bar */}
              <div className="flex items-center gap-3 px-1">
                <button
                  type="button"
                  onClick={() => setIsPlayingPrevis((p) => !p)}
                  aria-label={isPlayingPrevis ? 'Pause camera pre-vis' : 'Play camera pre-vis'}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.1] bg-[#181C24] text-[#F2F4F8] transition-colors hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
                >
                  {isPlayingPrevis ? (
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setElapsedSec(0)}
                  aria-label="Restart pre-vis timeline"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/[0.1] bg-[#181C24] text-[#949BA8] transition-colors hover:text-[#F2F4F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                </button>

                <input
                  type="range"
                  aria-label="Pre-vis playhead"
                  min={0}
                  max={effectiveDuration}
                  step={0.1}
                  value={elapsedSec}
                  onChange={(e) => {
                    setIsPlayingPrevis(false);
                    setElapsedSec(Number(e.target.value));
                  }}
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-lg bg-[#202631] accent-[#E5A93C]"
                />
              </div>
            </div>
          ) : (
            <div className="flex aspect-video w-full flex-col items-center justify-center rounded-lg border border-dashed border-white/[0.12] bg-[#0B0D10] px-6 py-12 text-center">
              <Film className="mb-3 h-7 w-7 text-[#E5A93C]" aria-hidden="true" />
              <h3 className="font-display text-base font-semibold text-[#F2F4F8]">
                Upload a reference photo or load a starter plate
              </h3>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[#949BA8]">
                Click Generate Video to encode a playable WebM motion video directly in your browser,
                or select a saved video model and its provider.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                {STARTER_REFERENCES.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => onApplyStarter(s.id)}
                    className="rounded-lg border border-white/[0.12] bg-[#181C24] px-3.5 py-2 text-xs font-medium text-[#F2F4F8] transition-colors hover:border-[#E5A93C]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
                  >
                    Load {s.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Status / Feedback Strip */}
        {(generationError || statusMessage || (!hasWanApiKey && !hasLocalWanEndpoint && !currentInput.remoteEndpoint?.trim())) && (
          <div className="border-t border-white/[0.08] bg-[#12151B] px-4 py-3 text-xs">
            {generationError ? (
              <p role="alert" className="text-red-300">
                {generationError}
              </p>
            ) : statusMessage ? (
              <p className="text-[#E8ECF2]">{statusMessage}</p>
            ) : (
              <p className="text-[#949BA8]">
                Ready: active model{' '}
                <code className="font-mono text-[#D1D6E0]">
                  {currentInput.remoteModelId?.trim() || currentInput.modelId}
                </code>{' '}
                ({currentInput.remoteProvider || 'auto'} · key:{' '}
                <code className="font-mono text-[#D1D6E0]">
                  {currentInput.secretEnvName || 'auto'}
                </code>
                ). Select a cloud adapter (<code className="font-mono text-[#D1D6E0]">huggingface</code>,{' '}
                <code className="font-mono text-[#D1D6E0]">fal</code>,{' '}
                <code className="font-mono text-[#D1D6E0]">replicate</code>,{' '}
                <code className="font-mono text-[#D1D6E0]">dashscope</code>) or enter an HTTPS endpoint URL for remote neural video, A text director needs a saved video renderer.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Inspector Tabs */}
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#12151B]">
        <div
          role="tablist"
          aria-label="Output Inspector"
          className="flex items-center gap-1 border-b border-white/[0.08] px-3 pt-2.5"
        >
          {(
            [
              { id: 'prompt', label: 'Compiled Video Prompt' },
              { id: 'payload', label: 'API Payload & CLI' },
              { id: 'history', label: `Session History (${history.length})` },
            ] as const
          ).map((tab) => {
            const active = inspectorTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setInspectorTab(tab.id)}
                className={`relative px-3 pb-2.5 pt-1 text-xs font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] rounded-t ${
                  active ? 'text-[#F2F4F8]' : 'text-[#949BA8] hover:text-[#F2F4F8]'
                }`}
              >
                {tab.label}
                {active && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-[2px] bg-[#E5A93C]"
                  />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-4">
          {inspectorTab === 'prompt' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-[#949BA8]">
                  Compiled for selected model ({displayJob.model})
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy('prompt', displayJob.compiledPrompt)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#181C24] px-2.5 py-1 text-xs font-medium text-[#F2F4F8] transition-colors hover:border-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
                >
                  {copiedKey === 'prompt' ? (
                    <Check className="h-3.5 w-3.5 text-[#E5A93C]" aria-hidden="true" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{copiedKey === 'prompt' ? 'Copied' : 'Copy Prompt'}</span>
                </button>
              </div>
              <pre className="whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-[#0B0D10] p-3.5 font-mono text-xs leading-relaxed text-[#E2E6EE]">
                {displayJob.compiledPrompt}
              </pre>
            </div>
          )}

          {inspectorTab === 'payload' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#D1D6E0]">
                    Higgsfield CLI Command
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy('cli', displayJob.cliCommand)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#181C24] px-2.5 py-1 text-xs font-medium text-[#F2F4F8] hover:border-white/25"
                  >
                    {copiedKey === 'cli' ? (
                      <Check className="h-3.5 w-3.5 text-[#E5A93C]" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{copiedKey === 'cli' ? 'Copied' : 'Copy CLI'}</span>
                  </button>
                </div>
                <pre className="overflow-x-auto rounded-lg border border-white/[0.06] bg-[#0B0D10] p-3 font-mono text-xs text-[#D1D6E0]">
                  {displayJob.cliCommand}
                </pre>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#D1D6E0]">
                    Video JSON Specification
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy('json', jsonPayloadString)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-white/[0.1] bg-[#181C24] px-2.5 py-1 text-xs font-medium text-[#F2F4F8] hover:border-white/25"
                  >
                    {copiedKey === 'json' ? (
                      <Check className="h-3.5 w-3.5 text-[#E5A93C]" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>{copiedKey === 'json' ? 'Copied' : 'Copy JSON'}</span>
                  </button>
                </div>
                <pre className="max-h-60 overflow-auto rounded-lg border border-white/[0.06] bg-[#0B0D10] p-3 font-mono text-xs text-[#D1D6E0]">
                  {jsonPayloadString}
                </pre>
              </div>
            </div>
          )}

          {inspectorTab === 'history' && (
            <div className="space-y-2.5">
              {history.length === 0 ? (
                <p className="py-6 text-center text-xs text-[#949BA8]">
                  No shots generated in this session yet. Configure a prompt and click Generate Video.
                </p>
              ) : (
                history.map((take) => {
                  const isSelected = activeTake?.id === take.id;
                  const takeRes =
                    take.job.parameters.resolution || take.job.parameters.quality || '720p';
                  return (
                    <div
                      key={take.id}
                      className={`flex items-center justify-between gap-3 rounded-lg border p-2.5 transition-colors ${
                        isSelected
                          ? 'border-[#E5A93C]/60 bg-[#E5A93C]/5'
                          : 'border-white/[0.08] bg-[#0B0D10]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectTake(take)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] rounded"
                      >
                        {take.thumbnailUrl ? (
                          <img
                            src={take.thumbnailUrl}
                            alt={`Thumbnail for ${take.input.prompt.slice(0, 40)}`}
                            referrerPolicy="no-referrer"
                            className="h-12 w-16 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-[#181C24] text-[#949BA8]">
                            <Film className="h-4 w-4" aria-hidden="true" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-medium text-[#F2F4F8]">
                            {take.input.prompt}
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-[#949BA8]">
                            {take.job.model} · {String(takeRes)} ·{' '}
                            {take.job.parameters.duration === -1
                              ? 'Smart'
                              : `${take.job.parameters.duration}s`}{' '}
                            · {take.status}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteTake(take.id)}
                        aria-label={`Delete shot "${take.input.prompt.slice(0, 24)}"`}
                        className="rounded p-1.5 text-[#949BA8] transition-colors hover:bg-white/[0.08] hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
