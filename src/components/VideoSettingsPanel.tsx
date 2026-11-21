import React, { useState } from 'react';
import { FREE_LTX_MODEL, isDirectorModel, modelIdentifierError, type ModelCatalog, type VideoModelOption } from '../lib/modelRouting';
import { BookmarkPlus, Check, Server, Trash2 } from 'lucide-react';
import {
  CAMERA_PRESETS,
  getWanModelSpec,
  STYLE_PRESETS,
  WAN3_SMART_DURATION,
  type RemoteProviderHint,
  type Wan3AspectRatio,
  type Wan3ModelId,
  type Wan3Resolution,
} from '../lib/wan3';

export interface SavedVideoModel {
  id: string;
  modelId: string;
  endpoint: string;
  provider: RemoteProviderHint;
  secretEnvName?: string;
  savedAt: string;
}

const KNOWN_SECRET_OPTIONS = [
  'WAN_API_KEY',
  'VIDEO_API_KEY',
  'CUSTOM_VIDEO_API_KEY',
  'HF_TOKEN',
  'HUGGINGFACE_API_KEY',
  'FAL_KEY',
  'REPLICATE_API_TOKEN',
  'DASHSCOPE_API_KEY',
  'OPENROUTER_API_KEY',
];

interface VideoSettingsPanelProps {
  modelCatalog: ModelCatalog;
  catalogError: string | null;
  rendererPresetId: string;
  onChangeRendererPresetId: (id: string) => void;
  onSaveRenderer: (model: VideoModelOption) => void;
  modelId: Wan3ModelId;
  remoteModelId: string;
  remoteEndpoint: string;
  remoteProvider: RemoteProviderHint;
  secretEnvName: string;
  savedModels: SavedVideoModel[];
  availableSecretKeys: string[];
  hasWanEndpointEnv: boolean;
  hasLocalWanEndpoint: boolean;
  aspectRatio: Wan3AspectRatio;
  resolution: Wan3Resolution;
  duration: number;
  cameraPresetId: string;
  stylePresetId: string;
  generateAudio: boolean;
  enableThinking: boolean;
  singleShot: boolean;
  onChangeRemoteModelId: (val: string) => void;
  onChangeRemoteEndpoint: (val: string) => void;
  onChangeRemoteProvider: (val: RemoteProviderHint) => void;
  onChangeSecretEnvName: (val: string) => void;
  onSaveModelPreset: () => void;
  onSelectSavedModel: (preset: SavedVideoModel) => void;
  onDeleteSavedModel: (id: string) => void;
  onChangeAspectRatio: (ratio: Wan3AspectRatio) => void;
  onChangeResolution: (res: Wan3Resolution) => void;
  onChangeDuration: (dur: number) => void;
  onChangeCamera: (cameraId: string) => void;
  onChangeStyle: (styleId: string) => void;
  onToggleAudio: (val: boolean) => void;
  onToggleThinking: (val: boolean) => void;
  onToggleSingleShot: (val: boolean) => void;
}

export function VideoSettingsPanel({
  modelCatalog,
  catalogError,
  rendererPresetId,
  onChangeRendererPresetId,
  onSaveRenderer,
  modelId,
  remoteModelId,
  remoteEndpoint,
  remoteProvider,
  secretEnvName,
  savedModels,
  availableSecretKeys,
  hasWanEndpointEnv,
  hasLocalWanEndpoint,
  aspectRatio,
  resolution,
  duration,
  cameraPresetId,
  stylePresetId,
  generateAudio,
  enableThinking,
  singleShot,
  onChangeRemoteModelId,
  onChangeRemoteEndpoint,
  onChangeRemoteProvider,
  onChangeSecretEnvName,
  onSaveModelPreset,
  onSelectSavedModel,
  onDeleteSavedModel,
  onChangeAspectRatio,
  onChangeResolution,
  onChangeDuration,
  onChangeCamera,
  onChangeStyle,
  onToggleAudio,
  onToggleThinking,
  onToggleSingleShot,
}: VideoSettingsPanelProps) {
  const [justSaved, setJustSaved] = useState(false);
  const spec = getWanModelSpec(modelId) || getWanModelSpec('custom')!;
  const isSmartDuration = duration === WAN3_SMART_DURATION;
  const displayModelLabel = remoteModelId.trim() || 'custom model';

  const secretOptions = Array.from(new Set([...availableSecretKeys, ...KNOWN_SECRET_OPTIONS]));
  const hasAnySecret = availableSecretKeys.length > 0 || hasLocalWanEndpoint;
  const isDirector = isDirectorModel(remoteModelId, modelCatalog);
  const identifierError = modelIdentifierError(remoteModelId);
  const savedRenderers = savedModels.filter(m => modelCatalog.videoModels.some(v => v.id === m.modelId) &&
    (m.provider === 'auto' || m.provider === 'openrouter' || m.provider === 'huggingface-space') && !m.endpoint);

  function handleSaveClick() {
    if (!remoteModelId.trim()) return;
    onSaveModelPreset();
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1800);
  }

  return (
    <section aria-labelledby="settings-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="settings-heading" className="text-sm font-semibold text-[#F2F4F8]">
          Video Model &amp; Endpoint Settings
        </h2>
        <span className="font-mono text-xs text-[#949BA8] whitespace-nowrap truncate max-w-[190px]">
          {displayModelLabel} · {resolution} · {isSmartDuration ? 'smart (-1)' : `${duration}s`}
        </span>
      </div>

      {/* Custom Video Model ID, Provider, Secret Binding, Endpoint & Saved Profiles */}
      <div className="space-y-3 rounded-lg border border-white/[0.08] bg-[#0E1116] p-3">
        <div className="space-y-2 rounded-md border border-emerald-500/30 p-3">
          <button type="button" onClick={() => onSaveRenderer(FREE_LTX_MODEL)} className="rounded bg-emerald-700 px-3 py-2 text-xs font-medium text-white">Use free LTX video renderer</button>
          <p className="text-[11px] text-[#949BA8]">Official Lightricks demo. Free shared GPU quota; no key required. Saves and activates LTX with a two-second, silent shot. An optional HF_TOKEN in Secrets uses your Hugging Face quota.</p>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-[#D1D6E0]">
            Custom Video Model &amp; Endpoint
          </span>
          <span
            className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${
              hasAnySecret ? 'text-emerald-400' : 'text-[#949BA8]'
            }`}
          >
            <Server className="h-3 w-3" aria-hidden="true" />
            {hasLocalWanEndpoint
              ? 'LOCAL_WAN_ENDPOINT active'
              : availableSecretKeys.length > 0
                ? `Secrets: ${availableSecretKeys.slice(0, 2).join(', ')}${
                    availableSecretKeys.length > 2 ? ` +${availableSecretKeys.length - 2}` : ''
                  }`
                : 'No video secret (public / local mode)'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="custom-video-model-id" className="block text-[11px] text-[#949BA8]">
              Saved Model ID (director or video)
            </label>
            <input
              id="custom-video-model-id"
              type="text"
              value={remoteModelId}
              onChange={(e) => onChangeRemoteModelId(e.target.value)}
              placeholder="Select a saved model or enter its exact provider ID"
              className="w-full rounded-lg border border-white/[0.1] bg-[#12151B] px-2.5 py-2 font-mono text-xs text-[#F2F4F8] placeholder:text-[#6B7380] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
            />
            {identifierError && <p role="alert" className="text-xs text-red-300">{identifierError}</p>}
          </div>

          <div className="space-y-1">
            <label htmlFor="remote-provider-select" className="block text-[11px] text-[#949BA8]">
              Provider Adapter Format
            </label>
            <select
              id="remote-provider-select"
              value={remoteProvider}
              onChange={(e) => onChangeRemoteProvider(e.target.value as RemoteProviderHint)}
              className="w-full rounded-lg border border-white/[0.1] bg-[#12151B] px-2.5 py-2 text-xs text-[#F2F4F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
            >
              <option value="auto">Auto-detect from Endpoint / ID</option>
              <option value="openrouter">OpenRouter Video API / Script Director</option>
              <option value="huggingface-space">Free LTX demo (Hugging Face Space)</option>
              <option value="huggingface">Hugging Face Inference (Wan2.1 / LTX)</option>
              <option value="fal">fal.ai (Queue / REST)</option>
              <option value="dashscope">Alibaba DashScope (Wan)</option>
              <option value="replicate">Replicate Predictions</option>
              <option value="comfyui">ComfyUI / Self-Hosted GPU</option>
              <option value="generic">Generic JSON REST</option>
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="secret-env-select" className="block text-[11px] text-[#949BA8]">
            Secret Key Binding (Settings → Secrets)
          </label>
          <select
            id="secret-env-select"
            value={secretEnvName}
            onChange={(e) => onChangeSecretEnvName(e.target.value)}
            className="w-full rounded-lg border border-white/[0.1] bg-[#12151B] px-2.5 py-2 font-mono text-xs text-[#F2F4F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
          >
            <option value="auto">Auto-match Secret for Provider (Recommended)</option>
            <option value="none">None / Public or Keyless Endpoint</option>
            {secretOptions.map((keyName) => {
              const isSet = availableSecretKeys.includes(keyName);
              return (
                <option key={keyName} value={keyName}>
                  {keyName} {isSet ? '(configured)' : '(not set)'}
                </option>
              );
            })}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="remote-video-endpoint" className="block text-[11px] text-[#949BA8]">
            Video API Endpoint URL (HTTPS cloud or leave blank to auto-derive from Provider)
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="remote-video-endpoint"
              type="url"
              value={remoteEndpoint}
              onChange={(e) => onChangeRemoteEndpoint(e.target.value)}
              placeholder="Optional: https://router.huggingface.co/hf-inference/models/..."
              className="flex-1 rounded-lg border border-white/[0.1] bg-[#12151B] px-2.5 py-2 font-mono text-xs text-[#F2F4F8] placeholder:text-[#6B7380] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
            />
            <button
              type="button"
              onClick={handleSaveClick}
              disabled={!remoteModelId.trim() || Boolean(identifierError)}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#E5A93C]/50 bg-[#E5A93C]/15 px-3 py-2 text-xs font-medium text-[#F5D692] transition-colors hover:bg-[#E5A93C]/25 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
            >
              {justSaved ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              ) : (
                <BookmarkPlus className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>{justSaved ? 'Saved & Active' : 'Save Model'}</span>
            </button>
          </div>
        </div>

        {/* Saved Custom Models for Next Session */}
        {savedModels.length > 0 && (
          <div className="space-y-1.5 border-t border-white/[0.06] pt-2.5">
            <span className="block text-[11px] font-medium text-[#949BA8]">
              Saved Models (Persisted for Next Visit)
            </span>
            <div className="space-y-1.5">
              {savedModels.map((preset) => {
                const presetSecret = preset.secretEnvName || 'auto';
                const isSelected =
                  preset.modelId === remoteModelId.trim() &&
                  preset.endpoint === remoteEndpoint.trim() &&
                  preset.provider === remoteProvider &&
                  presetSecret === secretEnvName;
                return (
                  <div
                    key={preset.id}
                    className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 transition-colors ${
                      isSelected
                        ? 'border-[#E5A93C]/70 bg-[#E5A93C]/10'
                        : 'border-white/[0.08] bg-[#12151B] hover:border-white/20'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectSavedModel(preset)}
                      className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] rounded"
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-xs font-medium text-[#F2F4F8]">
                          {preset.modelId}
                        </span>
                        {isSelected && (
                          <span className="shrink-0 font-mono text-[10px] font-semibold uppercase tracking-wide text-[#E5A93C]">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="truncate font-mono text-[10px] text-[#949BA8]">
                        {preset.provider} · key: {presetSecret} ·{' '}
                        {preset.endpoint || (isDirectorModel(preset.modelId, modelCatalog) ? 'Script director · OpenRouter' : 'Provider video endpoint')}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSavedModel(preset.id)}
                      aria-label={`Remove saved model ${preset.modelId}`}
                      className="rounded p-1 text-[#949BA8] transition-colors hover:bg-white/[0.08] hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isDirector && (
          <div className="space-y-2 rounded-md border border-[#E5A93C]/30 p-3">
            <p className="text-xs text-[#F5D692]">{remoteModelId} writes the script using its saved secret binding. A video model renders that script and your original prompt.</p>
            <label htmlFor="saved-video-renderer" className="block text-xs text-[#D1D6E0]">Saved video renderer</label>
            <select id="saved-video-renderer" value={rendererPresetId} onChange={e => onChangeRendererPresetId(e.target.value)} className="w-full rounded bg-[#12151B] p-2 text-xs">
              <option value="">{savedRenderers.length ? 'Use first verified saved video model' : 'No verified video renderer saved'}</option>
              {savedRenderers.map(m => <option key={m.id} value={m.id}>{m.modelId} · key: {m.secretEnvName || 'auto'}</option>)}
            </select>
          </div>
        )}
        <div className="space-y-1">
          <label htmlFor="video-catalog" className="block text-xs text-[#D1D6E0]">Add a video renderer from the live catalog</label>
          <select id="video-catalog" value="" onChange={e => {
            const model = modelCatalog.videoModels.find(m => m.id === e.target.value);
            if (model) onSaveRenderer(model);
          }} className="w-full rounded bg-[#12151B] p-2 text-xs">
            <option value="">Choose and save a video model…</option>
            {modelCatalog.videoModels.map(m => <option key={m.id} value={m.id}>{m.free ? '[Free quota] ' : '[Provider credits] '}{m.name} · {m.id}</option>)}
          </select>
          <p className="text-[11px] text-[#949BA8]">Free LTX uses None / keyless, or your HF_TOKEN. OpenRouter models use OPENROUTER_API_KEY and provider credits. Secret names are credential bindings, not model IDs.</p>
          {catalogError && <p role="alert" className="text-xs text-red-300">{catalogError} Reload to retry.</p>}
        </div>

        <p className="text-[11px] leading-relaxed text-[#949BA8]">
          Active model, endpoint, and secret binding auto-save for your next visit and apply
          directly on Generate Video. Works with <code className="font-mono text-[#D1D6E0]">HF_TOKEN</code>,{' '}
          <code className="font-mono text-[#D1D6E0]">FAL_KEY</code>,{' '}
          <code className="font-mono text-[#D1D6E0]">REPLICATE_API_TOKEN</code>,{' '}
          <code className="font-mono text-[#D1D6E0]">DASHSCOPE_API_KEY</code>,{' '}
          <code className="font-mono text-[#D1D6E0]">VIDEO_API_KEY</code>,{' '}
          <code className="font-mono text-[#D1D6E0]">WAN_API_KEY</code>
          {hasWanEndpointEnv ? ' (WAN_API_ENDPOINT set)' : ''},{' '}
          <code className="font-mono text-[#D1D6E0]">LOCAL_WAN_ENDPOINT</code>, or{' '}
          <code className="font-mono text-[#D1D6E0]">OPENROUTER_API_KEY</code> in{' '}
          <strong className="font-medium text-[#D1D6E0]">Settings → Secrets</strong>.
        </p>
      </div>

      {/* Aspect Ratio + Resolution/Quality */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-[#949BA8]">Aspect Ratio</span>
          <div className="grid grid-cols-3 gap-1.5">
            {spec.aspectRatios.map((ratio) => {
              const active = aspectRatio === ratio;
              return (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => onChangeAspectRatio(ratio)}
                  aria-pressed={active}
                  className={`rounded-md border px-2 py-1.5 font-mono text-xs transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] ${
                    active
                      ? 'border-[#E5A93C] bg-[#E5A93C]/15 text-[#F2F4F8]'
                      : 'border-white/[0.08] bg-[#12151B] text-[#949BA8] hover:border-white/20 hover:text-[#F2F4F8]'
                  }`}
                >
                  {ratio}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-[#949BA8]">Resolution</span>
          <div className="grid grid-cols-3 gap-1.5">
            {spec.resolutions.map((res) => {
              const active = resolution === res;
              return (
                <button
                  key={res}
                  type="button"
                  onClick={() => onChangeResolution(res)}
                  aria-pressed={active}
                  className={`rounded-md border px-2 py-1.5 font-mono text-xs transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] ${
                    active
                      ? 'border-[#E5A93C] bg-[#E5A93C]/15 text-[#F2F4F8]'
                      : 'border-white/[0.08] bg-[#12151B] text-[#949BA8] hover:border-white/20 hover:text-[#F2F4F8]'
                  }`}
                >
                  {res}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Duration */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="duration-slider" className="text-xs font-medium text-[#949BA8]">
            Duration
          </label>
          <span className="font-mono text-xs font-semibold text-[#F2F4F8] tabular-nums">
            {isSmartDuration ? 'Auto (10s)' : `${duration}s`}
          </span>
        </div>

        <input
          id="duration-slider"
          type="range"
          min={spec.durationMin}
          max={spec.durationMax}
          step={1}
          value={isSmartDuration ? 10 : duration}
          onChange={(e) => onChangeDuration(Number(e.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-[#202631] accent-[#E5A93C]"
        />
        <div className="flex justify-between font-mono text-[11px] text-[#6B7380]">
          <span>{spec.durationMin}s</span>
          <span>{Math.round((spec.durationMin + spec.durationMax) / 2)}s</span>
          <span>{spec.durationMax}s</span>
        </div>
      </div>

      {/* Camera & Look */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="camera-preset" className="block text-xs font-medium text-[#949BA8]">
            Camera Movement
          </label>
          <select
            id="camera-preset"
            value={cameraPresetId}
            onChange={(e) => onChangeCamera(e.target.value)}
            className="w-full rounded-lg border border-white/[0.1] bg-[#12151B] px-3 py-2 text-xs text-[#F2F4F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
          >
            {CAMERA_PRESETS.map((cam) => (
              <option key={cam.id} value={cam.id}>
                {cam.name} ({cam.category})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="style-preset" className="block text-xs font-medium text-[#949BA8]">
            Visual Look
          </label>
          <select
            id="style-preset"
            value={stylePresetId}
            onChange={(e) => onChangeStyle(e.target.value)}
            className="w-full rounded-lg border border-white/[0.1] bg-[#12151B] px-3 py-2 text-xs text-[#F2F4F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
          >
            {STYLE_PRESETS.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Boolean flags */}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <button
          type="button"
          role="switch"
          aria-checked={generateAudio}
          onClick={() => onToggleAudio(!generateAudio)}
          className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] ${
            generateAudio
              ? 'border-[#E5A93C]/60 bg-[#E5A93C]/10 text-[#F2F4F8]'
              : 'border-white/[0.08] bg-[#12151B] text-[#949BA8]'
          }`}
        >
          <span className="truncate">Native Audio</span>
          <span className="font-mono text-[11px]">{generateAudio ? 'ON' : 'OFF'}</span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={enableThinking}
          onClick={() => onToggleThinking(!enableThinking)}
          className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] ${
            enableThinking
              ? 'border-[#E5A93C]/60 bg-[#E5A93C]/10 text-[#F2F4F8]'
              : 'border-white/[0.08] bg-[#12151B] text-[#949BA8]'
          }`}
        >
          <span className="truncate">Thinking</span>
          <span className="font-mono text-[11px]">{enableThinking ? 'ON' : 'OFF'}</span>
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={singleShot}
          onClick={() => onToggleSingleShot(!singleShot)}
          className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] ${
            singleShot
              ? 'border-[#E5A93C]/60 bg-[#E5A93C]/10 text-[#F2F4F8]'
              : 'border-white/[0.08] bg-[#12151B] text-[#949BA8]'
          }`}
        >
          <span className="truncate">Single Shot Lock</span>
          <span className="font-mono text-[11px]">{singleShot ? 'ON' : 'OFF'}</span>
        </button>
      </div>
    </section>
  );
}
