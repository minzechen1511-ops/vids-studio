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
  provider?: RemoteProviderHint;
  free?: boolean;
  supportsAudio?: boolean;
}

export const FREE_LTX_MODEL: VideoModelOption = {
  id: 'Lightricks/LTX-Video-0.9.8-13B-distilled',
  name: 'LTX Video 0.9.8 Distilled · Free shared GPU',
  provider: 'huggingface-space', free: true, supportsAudio: false,
  supported_durations: [2, 3, 4, 5, 6, 7, 8],
  supported_resolutions: ['480p', '720p'],
  supported_aspect_ratios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
};

export function modelIdentifierError(value: string): string | null {
  if (/^(?:[a-z][a-z0-9_]*_(?:api_key|token)|api_key)$/i.test(value.trim())) {
    return 'This is a secret name, not a model ID. Choose a video model; put the credential name in Secret Key Binding.';
  }
  if (/^(?:sk-|hf_[A-Za-z0-9]{10,})/.test(value.trim())) {
    return 'API key values belong in Settings → Secrets. Choose a model ID here.';
  }
  return null;
}

export interface ModelCatalog {
  videoModels: VideoModelOption[];
  textModelIds: string[];
  visionModelIds?: string[];
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
  const identifierError = modelIdentifierError(selected);
  if (identifierError) throw new Error(identifierError);
  const video = catalog.videoModels.find(m => m.id === selected);
  const usesOpenRouter = input.remoteProvider === 'openrouter' ||
    ((!input.remoteProvider || input.remoteProvider === 'auto') && !input.remoteEndpoint);
  if (!usesOpenRouter) return { videoInput: input };
  if (video) {
    return { videoInput: { ...input, remoteProvider: video.provider || 'openrouter' } };
  }
  if (!isDirectorModel(selected, catalog)) {
    throw new Error(`Model "${selected}" is not in the live video catalog. Choose a video-capable saved model or configure its provider and endpoint.`);
  }
  const candidates = savedModels.filter(m => catalog.videoModels.some(v => v.id === m.modelId &&
    (m.provider === 'auto' || m.provider === (v.provider || 'openrouter'))) && !m.endpoint);
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
      remoteProvider: catalog.videoModels.find(m => m.id === renderer.modelId)?.provider || 'openrouter',
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
