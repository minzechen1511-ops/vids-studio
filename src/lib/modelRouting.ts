import type { RemoteProviderHint, Wan3GenerationInput } from './wan3';

export interface SavedModelRoute {
  id: string;
  modelId: string;
  endpoint: string;
  provider: RemoteProviderHint;
  secretEnvName?: string;
}

export interface VideoModelOption {
  id: string;
  name: string;
  supported_durations?: number[];
  supported_resolutions?: string[];
  supported_aspect_ratios?: string[];
}

export interface ModelCatalog {
  videoModels: VideoModelOption[];
  textModelIds: string[];
}

export function isDirectorModel(modelId: string, catalog?: ModelCatalog): boolean {
  return Boolean(catalog?.textModelIds.includes(modelId)) || /^moonshotai\/kimi-/i.test(modelId);
}

export function selectGenerationRoute(
  input: Wan3GenerationInput,
  savedModels: SavedModelRoute[],
  catalog: ModelCatalog,
): { videoInput: Wan3GenerationInput; directorModel?: string; directorSecret?: string } {
  const selected = input.remoteModelId?.trim() || '';
  const video = catalog.videoModels.find(m => m.id === selected);
  const usesOpenRouter = input.remoteProvider === 'openrouter' ||
    ((!input.remoteProvider || input.remoteProvider === 'auto') && !input.remoteEndpoint);
  if (!usesOpenRouter) return { videoInput: input };
  if (video) {
    return { videoInput: { ...input, remoteProvider: 'openrouter' } };
  }
  if (!isDirectorModel(selected, catalog)) {
    throw new Error(`Model "${selected}" is not in the live video catalog. Choose a video-capable saved model or configure its provider and endpoint.`);
  }
  const candidates = savedModels.filter(m => catalog.videoModels.some(v => v.id === m.modelId) &&
    (m.provider === 'auto' || m.provider === 'openrouter') && !m.endpoint);
  const renderer = input.rendererPresetId
    ? candidates.find(m => m.id === input.rendererPresetId)
    : candidates[0];
  if (!renderer) {
    throw new Error(`"${selected}" writes scripts and cannot output video. Save a video model from the live catalog and select it as the renderer. Your director selection is preserved.`);
  }
  return {
    directorModel: selected,
    directorSecret: input.secretEnvName || 'auto',
    videoInput: {
      ...input,
      remoteModelId: renderer.modelId,
      remoteEndpoint: undefined,
      remoteProvider: 'openrouter',
      secretEnvName: renderer.secretEnvName || 'auto',
    },
  };
}

export function validateVideoModelSettings(input: Wan3GenerationInput, model: VideoModelOption): void {
  const checks: [unknown, unknown[] | undefined, string][] = [
    [input.duration, model.supported_durations, 'duration'],
    [input.resolution, model.supported_resolutions, 'resolution'],
    [input.aspectRatio === 'auto' ? '16:9' : input.aspectRatio, model.supported_aspect_ratios, 'aspect ratio'],
  ];
  for (const [value, supported, label] of checks) {
    if (supported?.length && !supported.includes(value)) {
      throw new Error(`${model.name} supports ${label}: ${supported.join(', ')}. Update the shot settings before generating.`);
    }
  }
}
