import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { OpenRouterPromptBox } from './components/OpenRouterPromptBox';
import { ReferenceUploader } from './components/ReferenceUploader';
import { SkillDocsView } from './components/SkillDocsView';
import {
  StageViewport,
  type AppliedModelInfo,
  type HistoryTake,
} from './components/StageViewport';
import { TopBar, type AppView } from './components/TopBar';
import { VideoSettingsPanel, type SavedVideoModel } from './components/VideoSettingsPanel';
import { VocabBrowser } from './components/VocabBrowser';
import { isDirectorModel, type ModelCatalog, type VideoModelOption } from './lib/modelRouting';
import type { OpenRouterModelOption } from './lib/openrouterModels';
import type { AiDirectorPlan } from './lib/promptSceneParser';
import {
  buildWan3CompiledJob,
  getEffectiveModelId,
  getWanModelSpec,
  OPENROUTER_PRESET_MODELS,
  STARTER_REFERENCES,
  validateWan3Payload,
  type ReferenceAsset,
  type RemoteProviderHint,
  type Wan3AspectRatio,
  type Wan3GenerationInput,
  type Wan3MediaMode,
  type Wan3ModelId,
  type Wan3Resolution,
} from './lib/wan3';

const HISTORY_STORAGE_KEY = 'mz_vids_studio_history_v1';
const SAVED_MODELS_STORAGE_KEY = 'mz_vids_saved_models_v1';
const ACTIVE_CONFIG_STORAGE_KEY = 'mz_vids_active_config_v1';
const DEFAULT_OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

interface ActiveRoutingConfig {
  remoteModelId: string;
  remoteEndpoint: string;
  remoteProvider: RemoteProviderHint;
  secretEnvName: string;
  openrouterModel: string;
  openrouterEndpoint: string;
  rendererPresetId?: string;
}

function loadSavedActiveConfig(): Partial<ActiveRoutingConfig> {
  try {
    const raw = localStorage.getItem(ACTIVE_CONFIG_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<ActiveRoutingConfig>) : {};
  } catch {
    return {};
  }
}

interface ServerCapabilities {
  hasOpenRouterKey: boolean;
  hasWanKeyOnly: boolean;
  hasAnyVideoSecret?: boolean;
  availableSecretKeys?: string[];
  hasWanEndpointEnv: boolean;
  hasWanApiKey: boolean;
  hasLocalWanEndpoint: boolean;
  skillRepoExists: boolean;
  defaultOpenRouterModel: string;
  defaultWanModelId?: string;
  defaultWanProvider?: RemoteProviderHint;
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('studio');
  const [capabilities, setCapabilities] = useState<ServerCapabilities>({
    hasOpenRouterKey: false,
    hasWanKeyOnly: false,
    hasAnyVideoSecret: false,
    availableSecretKeys: [],
    hasWanEndpointEnv: false,
    hasWanApiKey: false,
    hasLocalWanEndpoint: false,
    skillRepoExists: true,
    defaultOpenRouterModel: OPENROUTER_PRESET_MODELS[0].id,
  });

  const initialConfig = useMemo(() => loadSavedActiveConfig(), []);

  // Shot Composer State — single Custom Video Model mode backed by saved presets
  const [modelId, setModelId] = useState<Wan3ModelId>('custom');
  const [remoteModelId, setRemoteModelId] = useState<string>(
    initialConfig.remoteModelId ?? ''
  );
  const [remoteEndpoint, setRemoteEndpoint] = useState<string>(
    initialConfig.remoteEndpoint ?? ''
  );
  const [remoteProvider, setRemoteProvider] = useState<RemoteProviderHint>(
    initialConfig.remoteProvider ?? 'auto'
  );
  const [secretEnvName, setSecretEnvName] = useState<string>(
    initialConfig.secretEnvName ?? 'auto'
  );

  const [savedModels, setSavedModels] = useState<SavedVideoModel[]>(() => {
    try {
      const raw = localStorage.getItem(SAVED_MODELS_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as SavedVideoModel[]) : [];
    } catch {
      return [];
    }
  });
  const [modelsHydrated, setModelsHydrated] = useState(false);
  const [rendererPresetId, setRendererPresetId] = useState(initialConfig.rendererPresetId || '');
  const [modelCatalog, setModelCatalog] = useState<ModelCatalog>({ videoModels: [], textModelIds: [] });
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [mediaMode, setMediaMode] = useState<Wan3MediaMode>('frames');
  const [startImage, setStartImage] = useState<ReferenceAsset | null>({
    id: 'starter-init',
    name: 'night_alley_rider.jpg',
    dataUrl: STARTER_REFERENCES[0].imageUrl,
    role: 'start_image',
  });
  const [endImage, setEndImage] = useState<ReferenceAsset | null>(null);
  const [referenceImages, setReferenceImages] = useState<ReferenceAsset[]>([]);

  const [prompt, setPrompt] = useState<string>(STARTER_REFERENCES[0].suggestedPrompt);
  const [negativePrompt, setNegativePrompt] = useState<string>('');
  const [audioCue, setAudioCue] = useState<string>(
    'Soft rain on cobblestones, low motorcycle idle hum'
  );
  const [openrouterModel, setOpenRouterModel] = useState<string>(
    initialConfig.openrouterModel ?? OPENROUTER_PRESET_MODELS[0].id
  );
  const [openrouterEndpoint, setOpenRouterEndpoint] = useState<string>(
    initialConfig.openrouterEndpoint ?? DEFAULT_OPENROUTER_ENDPOINT
  );

  const [aspectRatio, setAspectRatio] = useState<Wan3AspectRatio>('16:9');
  const [resolution, setResolution] = useState<Wan3Resolution>('720p');
  const [duration, setDuration] = useState<number>(5);
  const [cameraPresetId, setCameraPresetId] = useState<string>('dolly-in');
  const [stylePresetId, setStylePresetId] = useState<string>('cinematic');
  const [generateAudio, setGenerateAudio] = useState<boolean>(true);
  const [enableThinking, setEnableThinking] = useState<boolean>(false);
  const [singleShot, setSingleShot] = useState<boolean>(true);

  // Async & Output State
  const [freeOpenRouterModels, setFreeOpenRouterModels] = useState<OpenRouterModelOption[]>(() => [
    ...OPENROUTER_PRESET_MODELS,
  ]);
  const [freeModelsSource, setFreeModelsSource] = useState<'live' | 'fallback'>('fallback');
  const [isLoadingFreeModels, setIsLoadingFreeModels] = useState<boolean>(false);

  const [isRefining, setIsRefining] = useState<boolean>(false);
  const [refineNotice, setRefineNotice] = useState<string | null>(null);
  const [refineError, setRefineError] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const [renderElapsedSec, setRenderElapsedSec] = useState<number>(0);
  const [renderTotalSec, setRenderTotalSec] = useState<number>(5);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);

  const [history, setHistory] = useState<HistoryTake[]>(() => {
    try {
      const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as HistoryTake[]) : [];
    } catch {
      return [];
    }
  });
  const [activeTake, setActiveTake] = useState<HistoryTake | null>(null);

  useEffect(() => {
    fetch('/api/model-catalog').then(async res => {
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load the live model catalog.');
      setModelCatalog(data);
    }).catch(err => setCatalogError(err.message));
    fetch('/api/capabilities')
      .then((res) => (res.ok ? (res.json() as Promise<ServerCapabilities>) : null))
      .then((data) => {
        if (data) {
          setCapabilities(data);
          if (data.defaultOpenRouterModel && !initialConfig.openrouterModel) {
            setOpenRouterModel(data.defaultOpenRouterModel);
          }
          if (data.defaultWanProvider && !initialConfig.remoteProvider) {
            setRemoteProvider(data.defaultWanProvider);
          }
        }
      })
      .catch(() => {
        // Keep safe defaults
      });

    fetch('/api/saved-models')
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{
              savedModels?: SavedVideoModel[];
              activeConfig?: Partial<ActiveRoutingConfig>;
            }>)
          : null
      )
      .then((data) => {
        if (!data) return;
        if (Array.isArray(data.savedModels) && data.savedModels.length > 0) {
          setSavedModels((prev) => {
            if (prev.length === 0) return data.savedModels!;
            const existingKeys = new Set(
              prev.map((m) => `${m.modelId}|${m.endpoint}|${m.provider}|${m.secretEnvName || 'auto'}`)
            );
            const merged = [...prev];
            for (const item of data.savedModels!) {
              const key = `${item.modelId}|${item.endpoint}|${item.provider}|${item.secretEnvName || 'auto'}`;
              if (!existingKeys.has(key)) {
                merged.push(item);
              }
            }
            return merged.slice(0, 16);
          });
        }
        if (data.activeConfig && !initialConfig.remoteModelId) {
          if (data.activeConfig.remoteModelId) setRemoteModelId(data.activeConfig.remoteModelId);
          if (data.activeConfig.remoteEndpoint !== undefined)
            setRemoteEndpoint(data.activeConfig.remoteEndpoint);
          if (data.activeConfig.remoteProvider) setRemoteProvider(data.activeConfig.remoteProvider);
          if (data.activeConfig.secretEnvName) setSecretEnvName(data.activeConfig.secretEnvName);
          if (data.activeConfig.rendererPresetId) setRendererPresetId(data.activeConfig.rendererPresetId);
          if (data.activeConfig.openrouterModel && !initialConfig.openrouterModel) {
            setOpenRouterModel(data.activeConfig.openrouterModel);
          }
          if (data.activeConfig.openrouterEndpoint && !initialConfig.openrouterEndpoint) {
            setOpenRouterEndpoint(data.activeConfig.openrouterEndpoint);
          }
        }
      })
      .catch(() => {
        // Ignore server store unavailability
      })
      .finally(() => {
        setModelsHydrated(true);
      });
  }, [initialConfig.openrouterEndpoint, initialConfig.openrouterModel, initialConfig.remoteModelId, initialConfig.remoteProvider]);

  async function loadFreeOpenRouterModels(forceRefresh = false) {
    setIsLoadingFreeModels(true);
    try {
      const res = await fetch(`/api/openrouter/models${forceRefresh ? '?refresh=1' : ''}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        source?: 'live' | 'fallback';
        models?: OpenRouterModelOption[];
      };
      if (Array.isArray(data.models) && data.models.length > 0) {
        setFreeOpenRouterModels(data.models);
        setFreeModelsSource(data.source === 'live' ? 'live' : 'fallback');
      }
    } catch {
      // Keep fallback presets
    } finally {
      setIsLoadingFreeModels(false);
    }
  }

  useEffect(() => {
    void loadFreeOpenRouterModels(false);
  }, []);

  async function syncSavedStateToServer(
    nextModels: SavedVideoModel[],
    nextActive: ActiveRoutingConfig
  ) {
    const response = await fetch('/api/saved-models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        savedModels: nextModels,
        activeConfig: { ...nextActive, rendererPresetId },
      }),
    }).catch(() => null);
    if (!response?.ok) setStatusMessage('Saved in this browser; server sync failed. Retry saving before generating.');
    return Boolean(response?.ok);
  }

  useEffect(() => {
    const payload: ActiveRoutingConfig = {
      remoteModelId,
      remoteEndpoint,
      remoteProvider,
      secretEnvName,
      openrouterModel,
      openrouterEndpoint,
      rendererPresetId,
    };
    try {
      localStorage.setItem(ACTIVE_CONFIG_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
    if (modelsHydrated) {
      const timer = window.setTimeout(() => {
        syncSavedStateToServer(savedModels, payload);
      }, 350);
      return () => window.clearTimeout(timer);
    }
  }, [remoteModelId, remoteEndpoint, remoteProvider, secretEnvName, openrouterModel, openrouterEndpoint, savedModels, rendererPresetId, modelsHydrated]);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_MODELS_STORAGE_KEY, JSON.stringify(savedModels));
    } catch {
      // Ignore storage quota errors
    }
  }, [savedModels]);

  useEffect(() => {
    try {
      // Strip ephemeral blob: URLs and huge inline dataUrls from localStorage backup
      const compactHistory = history.slice(0, 15).map((item) => ({
        ...item,
        videoUrl: item.videoUrl && item.videoUrl.startsWith('blob:') ? null : item.videoUrl,
        thumbnailUrl:
          item.thumbnailUrl && item.thumbnailUrl.length < 180_000 ? item.thumbnailUrl : null,
        input: {
          ...item.input,
          startImage: item.input.startImage
            ? {
                ...item.input.startImage,
                dataUrl:
                  item.input.startImage.dataUrl.length < 180_000
                    ? item.input.startImage.dataUrl
                    : '',
              }
            : null,
          endImage: item.input.endImage
            ? {
                ...item.input.endImage,
                dataUrl:
                  item.input.endImage.dataUrl.length < 180_000 ? item.input.endImage.dataUrl : '',
              }
            : null,
          referenceImages: (item.input.referenceImages || []).map((r) => ({
            ...r,
            dataUrl: r.dataUrl.length < 180_000 ? r.dataUrl : '',
          })),
        },
      }));
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(compactHistory));
    } catch {
      // Ignore storage quota errors
    }
  }, [history]);

  const activeModelSpec = useMemo(
    () => getWanModelSpec(modelId) || getWanModelSpec('custom')!,
    [modelId]
  );

  // Build active generation payload enforcing frames vs references separation
  const currentInput: Wan3GenerationInput = useMemo(
    () => ({
      modelId,
      remoteModelId: remoteModelId.trim() || undefined,
      remoteEndpoint: remoteEndpoint.trim() || undefined,
      remoteProvider,
      secretEnvName,
      openrouterModel,
      openrouterEndpoint,
      rendererPresetId,
      prompt,
      negativePrompt,
      audioCue,
      duration,
      resolution,
      aspectRatio,
      generateAudio,
      enableThinking,
      singleShot,
      cameraPresetId,
      stylePresetId,
      mediaMode,
      startImage: mediaMode === 'frames' ? startImage : null,
      endImage: mediaMode === 'frames' ? endImage : null,
      referenceImages: mediaMode === 'references' ? referenceImages : [],
    }),
    [
      modelId,
      remoteModelId,
      remoteEndpoint,
      remoteProvider,
      secretEnvName,
      openrouterModel,
      openrouterEndpoint,
      rendererPresetId,
      prompt,
      negativePrompt,
      audioCue,
      duration,
      resolution,
      aspectRatio,
      generateAudio,
      enableThinking,
      singleShot,
      cameraPresetId,
      stylePresetId,
      mediaMode,
      startImage,
      endImage,
      referenceImages,
    ]
  );

  const effectiveModelLabel = useMemo(
    () => getEffectiveModelId(currentInput),
    [currentInput]
  );
  const validation = useMemo(() => validateWan3Payload(currentInput), [currentInput]);
  const compiledJob = useMemo(() => buildWan3CompiledJob(currentInput), [currentInput]);

  function handleSaveModelPreset() {
    const cleanModel = remoteModelId.trim();
    if (!cleanModel) return;
    const cleanEndpoint = remoteEndpoint.trim();
    const cleanSecret = secretEnvName || 'auto';
    const nextItem: SavedVideoModel = {
      id: `model-${Date.now()}`,
      modelId: cleanModel,
      endpoint: cleanEndpoint,
      provider: remoteProvider,
      secretEnvName: cleanSecret,
      savedAt: new Date().toISOString(),
    };
    const nextModels = [
      nextItem,
      ...savedModels.filter(
        (m) =>
          !(
            m.modelId === cleanModel &&
            m.endpoint === cleanEndpoint &&
            m.provider === remoteProvider &&
            (m.secretEnvName || 'auto') === cleanSecret
          )
      ),
    ].slice(0, 12);
    setSavedModels(nextModels);
    syncSavedStateToServer(nextModels, {
      remoteModelId: cleanModel,
      remoteEndpoint: cleanEndpoint,
      remoteProvider,
      secretEnvName: cleanSecret,
      openrouterModel,
      openrouterEndpoint,
    });
  }

  function handleSelectSavedModel(preset: SavedVideoModel) {
    const nextSecret = preset.secretEnvName || 'auto';
    setModelId('custom');
    setRemoteModelId(preset.modelId);
    setRemoteEndpoint(preset.endpoint);
    setRemoteProvider(preset.provider);
    setSecretEnvName(nextSecret);
    if (isDirectorModel(preset.modelId, modelCatalog)) setOpenRouterModel(preset.modelId);
    setGenerationError(null);
    setStatusMessage(
      `Applied saved model "${preset.modelId}" (${preset.provider} · key: ${nextSecret}).`
    );
    syncSavedStateToServer(savedModels, {
      remoteModelId: preset.modelId,
      remoteEndpoint: preset.endpoint,
      remoteProvider: preset.provider,
      secretEnvName: nextSecret,
      openrouterModel,
      openrouterEndpoint,
    });
  }

  function handleSaveRenderer(model: VideoModelOption) {
    const existing = savedModels.find(m => m.modelId === model.id && m.provider === 'openrouter' && !m.endpoint);
    const preset: SavedVideoModel = existing || {
      id: `model-${Date.now()}`, modelId: model.id, endpoint: '', provider: 'openrouter',
      secretEnvName: 'OPENROUTER_API_KEY', savedAt: new Date().toISOString(),
    };
    setSavedModels(prev => existing ? prev : [preset, ...prev].slice(0, 16));
    setRendererPresetId(preset.id);
    if (!isDirectorModel(remoteModelId, modelCatalog)) handleSelectSavedModel(preset);
    if (model.supported_durations?.length && !model.supported_durations.includes(duration)) setDuration(model.supported_durations[0]);
    if (model.supported_resolutions?.length && !model.supported_resolutions.includes(resolution)) {
      const supported = model.supported_resolutions.find(r => ['480p', '720p', '1080p'].includes(r));
      if (supported) setResolution(supported as Wan3Resolution);
    }
    if (model.supported_aspect_ratios?.length && !model.supported_aspect_ratios.includes(aspectRatio)) {
      const supported = model.supported_aspect_ratios.find(r => ['16:9', '9:16', '1:1', '4:3', '3:4'].includes(r));
      if (supported) setAspectRatio(supported as Wan3AspectRatio);
    }
  }

  function handleDeleteSavedModel(id: string) {
    const nextModels = savedModels.filter((item) => item.id !== id);
    setSavedModels(nextModels);
    syncSavedStateToServer(nextModels, {
      remoteModelId,
      remoteEndpoint,
      remoteProvider,
      secretEnvName,
      openrouterModel,
      openrouterEndpoint,
    });
  }

  function handleSetStartImage(asset: ReferenceAsset | null) {
    setStartImage(asset);
    if (!asset) {
      setEndImage(null);
    }
    setActiveTake(null);
  }

  function handleApplyStarter(starterId: string) {
    const starter = STARTER_REFERENCES.find((s) => s.id === starterId);
    if (!starter) return;

    const useFrames = activeModelSpec.supportsFrames;
    if (useFrames) {
      setMediaMode('frames');
      setStartImage({
        id: `${starter.id}-${Date.now()}`,
        name: `${starter.title.toLowerCase().replace(/\s+/g, '_')}.jpg`,
        dataUrl: starter.imageUrl,
        role: 'start_image',
      });
      setEndImage(null);
    } else {
      setMediaMode('references');
      setReferenceImages([
        {
          id: `${starter.id}-${Date.now()}`,
          name: `${starter.title.toLowerCase().replace(/\s+/g, '_')}.jpg`,
          dataUrl: starter.imageUrl,
          role: 'image_references',
        },
      ]);
    }

    setPrompt(starter.suggestedPrompt);
    if (activeModelSpec.aspectRatios.includes(starter.aspectRatio)) {
      setAspectRatio(starter.aspectRatio);
    }
    setCameraPresetId(starter.cameraId);
    setStylePresetId(starter.styleId);
    setActiveTake(null);
    setStatusMessage(null);
    setGenerationError(null);
  }

  function handleNewShot() {
    setPrompt('');
    setNegativePrompt('');
    setAudioCue('');
    setStartImage(null);
    setEndImage(null);
    setReferenceImages([]);
    setActiveTake(null);
    setRefineNotice(null);
    setRefineError(null);
    setStatusMessage(null);
    setGenerationError(null);
    setActiveView('studio');
  }

  async function handleRefineWithOpenRouter() {
    if (!prompt.trim()) return;
    setIsRefining(true);
    setRefineError(null);
    setRefineNotice(null);

    const activeImages =
      mediaMode === 'frames'
        ? [startImage, endImage].filter((x): x is ReferenceAsset => Boolean(x))
        : referenceImages;

    try {
      const res = await fetch('/api/openrouter/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          openrouterModel: isDirectorModel(remoteModelId, modelCatalog) ? remoteModelId : openrouterModel,
          secretEnvName: isDirectorModel(remoteModelId, modelCatalog) ? secretEnvName : 'auto',
          openrouterEndpoint,
          modelId,
          remoteModelId: remoteModelId.trim() || undefined,
          resolution,
          aspectRatio,
          cameraPresetId,
          stylePresetId,
          duration,
          mediaMode,
          singleShot,
          generateAudio,
          images: activeImages.map((img) => ({ name: img.name, dataUrl: img.dataUrl })),
        }),
      });

      const data = (await res.json()) as {
        refinedPrompt?: string;
        audioCue?: string;
        negativePrompt?: string;
        mode?: string;
        model?: string;
        notice?: string;
        error?: string;
      };

      if (!res.ok) {
        setRefineError(data.error || `OpenRouter request failed (${res.status})`);
        return;
      }

      if (data.refinedPrompt) {
        setPrompt(data.refinedPrompt);
      }
      if (data.audioCue && generateAudio) {
        setAudioCue(data.audioCue);
      }
      if (data.negativePrompt) {
        setNegativePrompt(data.negativePrompt);
      }

      setRefineNotice(
        data.notice ||
          `Enhanced via ${data.model || openrouterModel} using Wan prompt structure.`
      );
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : 'Network error contacting OpenRouter.');
    } finally {
      setIsRefining(false);
    }
  }

  function handleCancelRender() {
    renderAbortRef.current?.abort();
    renderAbortRef.current = null;
  }

  async function handleGenerateVideo(e: React.FormEvent) {
    e.preventDefault();
    setGenerationError(null);
    setStatusMessage(null);

    if (!validation.valid) {
      setGenerationError(validation.errors.join(' '));
      return;
    }

    const abortController = new AbortController();
    renderAbortRef.current = abortController;
    const expectedSec = currentInput.duration === -1 ? 10 : currentInput.duration;
    setIsGenerating(true);
    setRenderProgress(4);
    setRenderElapsedSec(0);
    setRenderTotalSec(expectedSec);

    try {
      const synced = await syncSavedStateToServer(savedModels, { remoteModelId, remoteEndpoint, remoteProvider, secretEnvName, openrouterModel, openrouterEndpoint, rendererPresetId });
      if (!synced) throw new Error('Saved model sync failed. Retry saving before generating.');
      const res = await fetch('/api/wan/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentInput),
        signal: abortController.signal,
      });

      const data = (await res.json()) as {
        status?: 'completed' | 'submitted' | 'previs-ready';
        provider?: string;
        renderLocalFallback?: boolean;
        videoUrl?: string | null;
        taskId?: string | null;
        aiPlan?: AiDirectorPlan | null;
        appliedConfig?: AppliedModelInfo;
        job?: typeof compiledJob;
        notice?: string;
        error?: string;
      };

      if (!res.ok) {
        setGenerationError(data.error || `Generation failed (${res.status}).`);
        return;
      }

      let finalVideoUrl = data.videoUrl || null;
      let finalStatus: HistoryTake['status'] = data.status || 'previs-ready';
      let renderMeta: HistoryTake['renderMeta'];

      // Poll async GPU / Cloud endpoint if a taskId was returned without an immediate videoUrl
      if (!finalVideoUrl && data.taskId) {
        for (let attempt = 0; attempt < 240; attempt++) {
          if (abortController.signal.aborted) {
            throw new Error('Video rendering cancelled.');
          }
          await new Promise((r) => window.setTimeout(r, 5000));
          setRenderProgress(Math.min(95, 10 + Math.round((attempt / 240) * 85)));
          const pollRes = await fetch(`/api/wan/status/${encodeURIComponent(data.taskId)}`, {
            signal: abortController.signal,
          });
          if (!pollRes.ok) {
            const error = await pollRes.json().catch(() => ({}));
            throw new Error(error.error || `Video status check failed (${pollRes.status}).`);
          }
          if (pollRes.ok) {
            const pollData = (await pollRes.json()) as {
              videoUrl?: string | null;
              status?: string;
              error?: string | null;
            };
            if (pollData.status) {
              setStatusMessage(
                `Model "${data.appliedConfig?.model || effectiveModelLabel}" status: ${pollData.status}`
              );
            }
            if (pollData.videoUrl) {
              finalVideoUrl = pollData.videoUrl;
              finalStatus = 'completed';
              break;
            }
            if (
              pollData.error ||
              (pollData.status &&
                ['FAILED', 'ERROR', 'CANCELED', 'CANCELLED'].includes(pollData.status.toUpperCase()))
            ) {
              throw new Error(pollData.error || `Remote generation failed (${pollData.status}).`);
            }
          }
        }
        if (!finalVideoUrl) {
          throw new Error(
            `Timed out waiting for ${data.appliedConfig?.model || effectiveModelLabel} video result (task ${data.taskId}).`
          );
        }
      }

      const startSource =
        mediaMode === 'frames'
          ? startImage?.dataUrl || null
          : referenceImages[0]?.dataUrl || null;

      if (!finalVideoUrl) throw new Error('The provider returned no playable video. No local substitute was rendered.');

      setRenderProgress(100);

      const newTake: HistoryTake = {
        id: `take-${Date.now()}`,
        createdAt: new Date().toISOString(),
        status: finalStatus,
        videoUrl: finalVideoUrl,
        thumbnailUrl: startSource,
        input: currentInput,
        job: data.job || compiledJob,
        renderMeta,
        appliedConfig: data.appliedConfig,
      };

      setHistory((prev) => [newTake, ...prev]);
      setActiveTake(newTake);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setStatusMessage(data.notice || `${data.appliedConfig?.model || effectiveModelLabel} video rendered successfully.`);
    } catch (err) {
      if (
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.message === 'Video rendering cancelled.')
      ) {
        setStatusMessage('Video render cancelled.');
      } else {
        setGenerationError(
          err instanceof Error ? err.message : 'Error during video generation.'
        );
      }
    } finally {
      renderAbortRef.current = null;
      setIsGenerating(false);
    }
  }

  function handleSelectTake(take: HistoryTake) {
    setActiveTake(take);
    setModelId('custom');
    setRemoteModelId(take.input.remoteModelId || take.job.model || '');
    setRemoteEndpoint(take.input.remoteEndpoint || '');
    setRemoteProvider(take.input.remoteProvider || 'auto');
    setSecretEnvName(take.input.secretEnvName || 'auto');
    setPrompt(take.input.prompt);
    setNegativePrompt(take.input.negativePrompt || '');
    setAudioCue(take.input.audioCue || '');
    setDuration(take.input.duration);
    setResolution(take.input.resolution);
    setAspectRatio(take.input.aspectRatio);
    setGenerateAudio(take.input.generateAudio);
    setEnableThinking(take.input.enableThinking);
    setSingleShot(Boolean(take.input.singleShot));
    setCameraPresetId(take.input.cameraPresetId);
    setStylePresetId(take.input.stylePresetId);
    setMediaMode(take.input.mediaMode);
    if (take.input.mediaMode === 'frames') {
      if (take.input.startImage?.dataUrl) setStartImage(take.input.startImage);
      if (take.input.endImage?.dataUrl) setEndImage(take.input.endImage);
    } else if (take.input.referenceImages?.some((r) => r.dataUrl)) {
      setReferenceImages(take.input.referenceImages.filter((r) => r.dataUrl));
    }
  }

  function handleDeleteTake(id: string) {
    setHistory((prev) => prev.filter((item) => item.id !== id));
    if (activeTake?.id === id) {
      setActiveTake(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#0B0D10] text-[#F2F4F8]">
      <TopBar activeView={activeView} onNavigate={setActiveView} onNewShot={handleNewShot} />

      <main>
        {activeView === 'studio' && (
          <div className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
              {/* Left Composer Column */}
              <form
                onSubmit={handleGenerateVideo}
                className="space-y-6 rounded-xl border border-white/[0.08] bg-[#12151B] p-5 lg:col-span-5"
              >
                <div className="border-b border-white/[0.08] pb-4">
                  <h1 className="font-display text-xl font-semibold tracking-tight text-[#F2F4F8]">
                    MZ Vids Studio
                  </h1>
                  <p className="mt-1 text-xs leading-relaxed text-[#949BA8]">
                    Configure any custom video model ID and endpoint, refine prompts unfiltered via
                    OpenRouter, and render playable video clips.
                  </p>
                </div>

                <ReferenceUploader
                  mediaMode={mediaMode}
                  supportsFrames={activeModelSpec.supportsFrames}
                  supportsReferences={activeModelSpec.supportsReferences}
                  startImage={startImage}
                  endImage={endImage}
                  referenceImages={referenceImages}
                  onChangeMediaMode={setMediaMode}
                  onSetStartImage={handleSetStartImage}
                  onSetEndImage={setEndImage}
                  onAddReferenceImages={(assets) =>
                    setReferenceImages((prev) => [...prev, ...assets])
                  }
                  onRemoveReferenceImage={(id) =>
                    setReferenceImages((prev) => prev.filter((item) => item.id !== id))
                  }
                  onApplyStarter={handleApplyStarter}
                />

                <div className="border-t border-white/[0.08] pt-5">
                  <OpenRouterPromptBox
                    prompt={prompt}
                    negativePrompt={negativePrompt}
                    audioCue={audioCue}
                    openrouterModel={openrouterModel}
                    openrouterEndpoint={openrouterEndpoint}
                    freeModels={freeOpenRouterModels}
                    freeModelsSource={freeModelsSource}
                    isLoadingFreeModels={isLoadingFreeModels}
                    isRefining={isRefining}
                    refineNotice={refineNotice}
                    refineError={refineError}
                    hasOpenRouterKey={capabilities.hasOpenRouterKey}
                    onChangePrompt={setPrompt}
                    onChangeNegativePrompt={setNegativePrompt}
                    onChangeAudioCue={setAudioCue}
                    onChangeOpenRouterModel={setOpenRouterModel}
                    onChangeOpenRouterEndpoint={setOpenRouterEndpoint}
                    onRefreshFreeModels={() => void loadFreeOpenRouterModels(true)}
                    onRefineWithOpenRouter={handleRefineWithOpenRouter}
                  />
                </div>

                <div className="border-t border-white/[0.08] pt-5">
                  <VideoSettingsPanel
                    modelCatalog={modelCatalog}
                    catalogError={catalogError}
                    rendererPresetId={rendererPresetId}
                    onChangeRendererPresetId={setRendererPresetId}
                    onSaveRenderer={handleSaveRenderer}
                    modelId={modelId}
                    remoteModelId={remoteModelId}
                    remoteEndpoint={remoteEndpoint}
                    remoteProvider={remoteProvider}
                    secretEnvName={secretEnvName}
                    savedModels={savedModels}
                    availableSecretKeys={capabilities.availableSecretKeys || []}
                    hasWanEndpointEnv={capabilities.hasWanEndpointEnv}
                    hasLocalWanEndpoint={capabilities.hasLocalWanEndpoint}
                    aspectRatio={aspectRatio}
                    resolution={resolution}
                    duration={duration}
                    cameraPresetId={cameraPresetId}
                    stylePresetId={stylePresetId}
                    generateAudio={generateAudio}
                    enableThinking={enableThinking}
                    singleShot={singleShot}
                    onChangeRemoteModelId={setRemoteModelId}
                    onChangeRemoteEndpoint={setRemoteEndpoint}
                    onChangeRemoteProvider={setRemoteProvider}
                    onChangeSecretEnvName={setSecretEnvName}
                    onSaveModelPreset={handleSaveModelPreset}
                    onSelectSavedModel={handleSelectSavedModel}
                    onDeleteSavedModel={handleDeleteSavedModel}
                    onChangeAspectRatio={setAspectRatio}
                    onChangeResolution={setResolution}
                    onChangeDuration={setDuration}
                    onChangeCamera={setCameraPresetId}
                    onChangeStyle={setStylePresetId}
                    onToggleAudio={setGenerateAudio}
                    onToggleThinking={setEnableThinking}
                    onToggleSingleShot={setSingleShot}
                  />
                </div>

                {validation.warnings.length > 0 && (
                  <p className="rounded-lg border border-[#E5A93C]/30 bg-[#E5A93C]/10 px-3 py-2 text-xs text-[#F5D692]">
                    {validation.warnings[0]}
                  </p>
                )}

                {validation.errors.length > 0 && modelId === 'custom' && (
                  <p className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-200">
                    {validation.errors[0]}
                  </p>
                )}

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={isGenerating || !prompt.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#E5A93C] px-5 py-3 text-sm font-semibold text-[#0B0D10] transition-colors hover:bg-[#EEB854] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2F4F8]"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                    )}
                    <span>
                      {isGenerating
                        ? remoteEndpoint.trim() ||
                          (remoteProvider !== 'auto' && remoteProvider !== 'generic') ||
                          capabilities.hasWanApiKey ||
                          capabilities.hasLocalWanEndpoint
                          ? `Dispatching ${effectiveModelLabel}...`
                          : `Rendering Video (${renderProgress}%)...`
                        : 'Generate Video'}
                    </span>
                  </button>
                </div>
              </form>

              {/* Right Stage & Inspector Column */}
              <div className="lg:sticky lg:top-[76px] lg:col-span-7">
                <StageViewport
                  currentInput={currentInput}
                  compiledJob={compiledJob}
                  activeTake={activeTake}
                  history={history}
                  isGenerating={isGenerating}
                  renderProgress={renderProgress}
                  renderElapsedSec={renderElapsedSec}
                  renderTotalSec={renderTotalSec}
                  statusMessage={statusMessage}
                  generationError={generationError}
                  hasWanApiKey={capabilities.hasWanApiKey}
                  hasLocalWanEndpoint={capabilities.hasLocalWanEndpoint}
                  onSelectTake={handleSelectTake}
                  onDeleteTake={handleDeleteTake}
                  onApplyStarter={handleApplyStarter}
                  onClearActiveTake={() => setActiveTake(null)}
                  onCancelRender={handleCancelRender}
                />
              </div>
            </div>
          </div>
        )}

        {activeView === 'vocab' && (
          <VocabBrowser
            selectedCameraId={cameraPresetId}
            selectedStyleId={stylePresetId}
            onApplyCamera={(camId) => {
              setCameraPresetId(camId);
              setActiveView('studio');
            }}
            onApplyStyle={(stId) => {
              setStylePresetId(stId);
              setActiveView('studio');
            }}
          />
        )}

        {activeView === 'docs' && (
          <SkillDocsView
            hasOpenRouterKey={capabilities.hasOpenRouterKey}
            hasWanApiKey={capabilities.hasWanApiKey}
            hasLocalWanEndpoint={capabilities.hasLocalWanEndpoint}
          />
        )}
      </main>
    </div>
  );
}
