import { getEffectiveModelId, type Wan3CompiledJob, type Wan3GenerationInput } from './wan3';

export type WanProviderKind = 'dashscope' | 'fal' | 'replicate' | 'huggingface' | 'comfyui' | 'generic';

const ALLOWED_VIDEO_HOSTS = new Set([
  'queue.fal.run',
  'fal.run',
  'dashscope.aliyuncs.com',
  'dashscope-intl.aliyuncs.com',
  'api.replicate.com',
  'router.huggingface.co',
  'api-inference.huggingface.co',
  'platform.higgsfield.ai',
  'api.higgsfield.ai',
  'api.runwayml.com',
  'api.lumalabs.ai',
  'api.klingai.com',
  'api.wavespeed.ai',
  'api.novita.ai',
  'api.siliconflow.cn',
  'api.together.xyz',
  'api.aimlapi.com',
  'api.segmind.com',
]);

export const ALLOWED_VIDEO_SECRET_NAMES = [
  'WAN_API_KEY',
  'VIDEO_API_KEY',
  'CUSTOM_VIDEO_API_KEY',
  'HF_TOKEN',
  'HUGGINGFACE_API_KEY',
  'HUGGINGFACEHUB_API_TOKEN',
  'FAL_KEY',
  'FAL_API_KEY',
  'REPLICATE_API_TOKEN',
  'REPLICATE_API_KEY',
  'DASHSCOPE_API_KEY',
  'ALIBABA_API_KEY',
  'RUNWAY_API_KEY',
  'KLING_API_KEY',
  'HIGGSFIELD_API_KEY',
  'OPENROUTER_API_KEY',
] as const;

export function getAvailableVideoSecretNames(
  env: Record<string, string | undefined>
): string[] {
  return ALLOWED_VIDEO_SECRET_NAMES.filter((name) => Boolean(env[name]?.trim()));
}

export function resolveVideoSecretKey(
  provider: WanProviderKind,
  requestedSecretEnvName: string | undefined,
  env: Record<string, string | undefined>
): { apiKey: string | null; secretUsed: string | null } {
  const req = (requestedSecretEnvName || '').trim();
  if (req.toLowerCase() === 'none') {
    return { apiKey: null, secretUsed: 'none' };
  }

  if (req && req.toLowerCase() !== 'auto') {
    const allowed = ALLOWED_VIDEO_SECRET_NAMES.find((n) => n === req);
    if (allowed) {
      const val = env[allowed]?.trim();
      if (val) {
        return { apiKey: val, secretUsed: allowed };
      }
    }
  }

  const priorityByProvider: Record<WanProviderKind, string[]> = {
    huggingface: ['HF_TOKEN', 'HUGGINGFACE_API_KEY', 'HUGGINGFACEHUB_API_TOKEN', 'VIDEO_API_KEY', 'WAN_API_KEY'],
    fal: ['FAL_KEY', 'FAL_API_KEY', 'VIDEO_API_KEY', 'WAN_API_KEY'],
    replicate: ['REPLICATE_API_TOKEN', 'REPLICATE_API_KEY', 'VIDEO_API_KEY', 'WAN_API_KEY'],
    dashscope: ['DASHSCOPE_API_KEY', 'ALIBABA_API_KEY', 'VIDEO_API_KEY', 'WAN_API_KEY'],
    comfyui: ['CUSTOM_VIDEO_API_KEY', 'VIDEO_API_KEY', 'WAN_API_KEY'],
    generic: [
      'VIDEO_API_KEY',
      'CUSTOM_VIDEO_API_KEY',
      'WAN_API_KEY',
      'HF_TOKEN',
      'FAL_KEY',
      'REPLICATE_API_TOKEN',
      'DASHSCOPE_API_KEY',
      'HIGGSFIELD_API_KEY',
      'KLING_API_KEY',
      'RUNWAY_API_KEY',
    ],
  };

  const candidates = priorityByProvider[provider] || priorityByProvider.generic;
  for (const name of candidates) {
    const val = env[name]?.trim();
    if (val) {
      return { apiKey: val, secretUsed: name };
    }
  }

  return { apiKey: null, secretUsed: null };
}

export function resolveEffectiveVideoEndpoint(
  input: Pick<Wan3GenerationInput, 'remoteEndpoint' | 'remoteModelId' | 'remoteProvider'>,
  envEndpoint?: string,
  env?: Record<string, string | undefined>
): { endpoint: string | null; source: 'ui' | 'env' | 'derived' | 'none' } {
  const uiEndpoint = input.remoteEndpoint?.trim();
  if (uiEndpoint) {
    return { endpoint: uiEndpoint, source: 'ui' };
  }

  const configuredEnv = envEndpoint?.trim();
  if (configuredEnv) {
    return { endpoint: configuredEnv, source: 'env' };
  }

  const modelSlug = (input.remoteModelId || '').trim().replace(/^\/+|\/+$/g, '');
  const hint = (input.remoteProvider || 'auto').trim().toLowerCase();

  if (!modelSlug) {
    return { endpoint: null, source: 'none' };
  }

  if (hint === 'fal' || (hint === 'auto' && modelSlug.startsWith('fal-ai/'))) {
    return {
      endpoint: `https://queue.fal.run/${modelSlug}`,
      source: 'derived',
    };
  }

  if (hint === 'huggingface') {
    return {
      endpoint: `https://router.huggingface.co/hf-inference/models/${modelSlug}`,
      source: 'derived',
    };
  }

  if (hint === 'replicate' && modelSlug.includes('/')) {
    const ownerModel = modelSlug.split(':')[0];
    return {
      endpoint: `https://api.replicate.com/v1/models/${ownerModel}/predictions`,
      source: 'derived',
    };
  }

  if (hint === 'dashscope') {
    return {
      endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
      source: 'derived',
    };
  }

  // If auto mode with an org/repo slug and an HF token configured in Secrets, derive Hugging Face Inference URL
  const hasHfSecret = Boolean(
    env &&
      (env.HF_TOKEN?.trim() ||
        env.HUGGINGFACE_API_KEY?.trim() ||
        env.HUGGINGFACEHUB_API_TOKEN?.trim())
  );
  if (
    hint === 'auto' &&
    hasHfSecret &&
    /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(modelSlug) &&
    !modelSlug.startsWith('fal-ai/')
  ) {
    return {
      endpoint: `https://router.huggingface.co/hf-inference/models/${modelSlug}`,
      source: 'derived',
    };
  }

  return { endpoint: null, source: 'none' };
}

const ALLOWED_LLM_HOSTS = new Set([
  'openrouter.ai',
  'api.openai.com',
  'api.together.xyz',
  'api.groq.com',
  'api.deepseek.com',
  'api.fireworks.ai',
  'api.deepinfra.com',
  'api.novita.ai',
  'api.siliconflow.cn',
  'generativelanguage.googleapis.com',
]);

function isPrivateOrLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === 'metadata.google.internal' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost') ||
    host.startsWith('169.254.') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    host.startsWith('127.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    /^fc00:|^fd[0-9a-f]{2}:|^fe80:/i.test(host)
  ) {
    return true;
  }
  return false;
}

export function validateAllowedHttpsEndpoint(
  rawUrl: string,
  kind: 'video' | 'llm',
  extraAllowedHosts: string[] = []
): { allowed: boolean; normalizedUrl?: string; reason?: string } {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') {
      return { allowed: false, reason: 'Endpoint must use HTTPS.' };
    }
    if (parsed.username || parsed.password) {
      return { allowed: false, reason: 'Endpoint URL must not embed credentials.' };
    }

    const host = parsed.hostname.toLowerCase();
    if (isPrivateOrLoopbackHost(host)) {
      return {
        allowed: false,
        reason:
          'Private or loopback addresses cannot be called from the browser; configure LOCAL_WAN_ENDPOINT in server Secrets for local GPUs.',
      };
    }

    const allowlist = kind === 'llm' ? ALLOWED_LLM_HOSTS : ALLOWED_VIDEO_HOSTS;
    const isAllowlisted =
      allowlist.has(host) || extraAllowedHosts.some((h) => h.toLowerCase() === host);

    if (!isAllowlisted) {
      return {
        allowed: false,
        reason: `Host "${host}" is not in the supported cloud API allowlist. Set WAN_API_ENDPOINT or LOCAL_WAN_ENDPOINT directly in server Secrets to authorize custom hosts.`,
      };
    }

    return { allowed: true, normalizedUrl: parsed.toString() };
  } catch {
    return { allowed: false, reason: 'Invalid endpoint URL format.' };
  }
}

export function detectWanProvider(
  endpointUrl: string,
  explicitProvider?: string | null
): WanProviderKind {
  const hint = (explicitProvider || '').trim().toLowerCase();
  if (
    hint === 'dashscope' ||
    hint === 'fal' ||
    hint === 'replicate' ||
    hint === 'huggingface' ||
    hint === 'comfyui' ||
    hint === 'generic'
  ) {
    return hint;
  }

  const lower = endpointUrl.toLowerCase();
  if (lower.includes('dashscope')) return 'dashscope';
  if (lower.includes('fal.run') || lower.includes('fal.ai')) return 'fal';
  if (lower.includes('replicate.com')) return 'replicate';
  if (lower.includes('huggingface.co')) return 'huggingface';
  if (lower.includes(':8188') || lower.includes('/prompt')) return 'comfyui';
  return 'generic';
}

function toDashScopeSize(aspectRatio: string, resolution: string): string {
  const scale = resolution === '1080p' ? 1080 : resolution === '480p' ? 480 : 720;
  if (aspectRatio === '9:16') return scale === 1080 ? '1080*1920' : scale === 480 ? '480*832' : '720*1280';
  if (aspectRatio === '1:1') return scale === 1080 ? '1080*1080' : scale === 480 ? '480*480' : '720*720';
  if (aspectRatio === '4:3') return scale === 1080 ? '1440*1080' : scale === 480 ? '640*480' : '960*720';
  if (aspectRatio === '3:4') return scale === 1080 ? '1080*1440' : scale === 480 ? '480*640' : '720*960';
  return scale === 1080 ? '1920*1080' : scale === 480 ? '832*480' : '1280*720';
}

function toDashScopeModelName(input: Wan3GenerationInput): string {
  if (input.remoteModelId?.trim()) {
    return input.remoteModelId.trim();
  }

  const hasRefImages = input.mediaMode === 'references' && (input.referenceImages?.length || 0) > 0;
  const hasStart = input.mediaMode === 'frames' && Boolean(input.startImage);
  const hasEnd = input.mediaMode === 'frames' && Boolean(input.endImage);

  if (input.modelId === 'wan2_6') {
    if (hasRefImages) return 'wan2.6-r2v';
    return hasStart ? 'wan2.6-i2v' : 'wan2.6-t2v';
  }
  if (input.modelId === 'wan2_7') {
    if (hasStart && hasEnd) return 'wan2.7-kf2v';
    return hasStart ? 'wan2.7-i2v' : 'wan2.7-t2v';
  }
  if (hasStart && hasEnd) return 'wan3.0-kf2v';
  if (hasRefImages) return 'wan3.0-r2v';
  return hasStart ? 'wan3.0-i2v' : 'wan3.0-t2v';
}

export function buildProviderRequestPayload(
  provider: WanProviderKind,
  input: Wan3GenerationInput,
  job: Wan3CompiledJob
): { headers: Record<string, string>; body: Record<string, unknown> } {
  const duration = input.duration === -1 ? 10 : input.duration;
  const effectiveModel = getEffectiveModelId(input);

  if (provider === 'dashscope') {
    const dashInput: Record<string, unknown> = {
      prompt: job.compiledPrompt,
    };
    if (input.negativePrompt?.trim()) {
      dashInput.negative_prompt = input.negativePrompt.trim();
    }
    if (input.mediaMode === 'frames' && input.startImage?.dataUrl) {
      dashInput.img_url = input.startImage.dataUrl;
      if (input.endImage?.dataUrl) {
        dashInput.last_frame_url = input.endImage.dataUrl;
      }
    } else if (input.mediaMode === 'references' && input.referenceImages?.length) {
      dashInput.reference_urls = input.referenceImages.map((r) => r.dataUrl);
    }

    return {
      headers: {
        'X-DashScope-Async': 'enable',
      },
      body: {
        model: toDashScopeModelName(input),
        input: dashInput,
        parameters: {
          size: toDashScopeSize(input.aspectRatio, input.resolution),
          duration,
          audio: input.generateAudio,
          prompt_extend: input.enableThinking,
          shot_type: input.singleShot ? 'single' : 'multi',
        },
      },
    };
  }

  if (provider === 'fal') {
    const falBody: Record<string, unknown> = {
      model: effectiveModel,
      prompt: job.compiledPrompt,
      negative_prompt: input.negativePrompt?.trim() || '',
      duration: String(duration),
      resolution: input.resolution,
      aspect_ratio: input.aspectRatio === 'auto' ? '16:9' : input.aspectRatio,
      enable_audio: input.generateAudio,
      enable_prompt_expansion: input.enableThinking,
      multi_shots: !input.singleShot,
    };
    if (input.mediaMode === 'frames' && input.startImage?.dataUrl) {
      falBody.image_url = input.startImage.dataUrl;
      if (input.endImage?.dataUrl) {
        falBody.end_image_url = input.endImage.dataUrl;
      }
    } else if (input.mediaMode === 'references' && input.referenceImages?.length) {
      falBody.image_urls = input.referenceImages.map((r) => r.dataUrl);
    }
    return { headers: {}, body: falBody };
  }

  if (provider === 'replicate') {
    const isShaVersion = /^[0-9a-f]{64}$/i.test(effectiveModel);
    const replicateBody: Record<string, unknown> = {
      input: {
        prompt: job.compiledPrompt,
        negative_prompt: input.negativePrompt?.trim() || undefined,
        image:
          input.mediaMode === 'frames'
            ? input.startImage?.dataUrl || undefined
            : input.referenceImages?.[0]?.dataUrl || undefined,
        last_image:
          input.mediaMode === 'frames' ? input.endImage?.dataUrl || undefined : undefined,
        duration,
        resolution: input.resolution,
        aspect_ratio: input.aspectRatio === 'auto' ? '16:9' : input.aspectRatio,
        generate_audio: input.generateAudio,
      },
    };
    if (isShaVersion) {
      replicateBody.version = effectiveModel;
    } else if (effectiveModel && effectiveModel !== 'custom') {
      replicateBody.model = effectiveModel;
    }
    return {
      headers: {},
      body: replicateBody,
    };
  }

  if (provider === 'huggingface') {
    const firstImage =
      input.mediaMode === 'frames'
        ? input.startImage?.dataUrl
        : input.referenceImages?.[0]?.dataUrl;
    return {
      headers: {},
      body: {
        inputs: job.compiledPrompt,
        parameters: {
          prompt: job.compiledPrompt,
          negative_prompt: input.negativePrompt?.trim() || undefined,
          num_frames: Math.min(129, Math.max(25, duration * 16)),
          image: firstImage || undefined,
        },
      },
    };
  }

  // Generic & custom local GPU wrapper: pass complete structured parameters & all media
  return {
    headers: {},
    body: {
      model: effectiveModel,
      prompt: job.compiledPrompt,
      raw_prompt: input.prompt,
      negative_prompt: input.negativePrompt?.trim() || undefined,
      audio_cue: input.audioCue?.trim() || undefined,
      camera_preset: input.cameraPresetId,
      style_preset: input.stylePresetId,
      single_shot: Boolean(input.singleShot),
      parameters: job.parameters,
      start_image: input.startImage?.dataUrl || undefined,
      end_image: input.endImage?.dataUrl || undefined,
      image_references: input.referenceImages?.map((r) => r.dataUrl) || undefined,
    },
  };
}

export function extractVideoAndTask(data: Record<string, unknown>): {
  videoUrl: string | null;
  taskId: string | null;
  statusUrl: string | null;
  responseUrl: string | null;
} {
  const output =
    data.output && typeof data.output === 'object' && !Array.isArray(data.output)
      ? (data.output as Record<string, unknown>)
      : null;
  const videoObj =
    data.video && typeof data.video === 'object'
      ? (data.video as Record<string, unknown>)
      : null;
  const urlsObj =
    data.urls && typeof data.urls === 'object'
      ? (data.urls as Record<string, unknown>)
      : null;
  const nestedData =
    data.data && typeof data.data === 'object' && !Array.isArray(data.data)
      ? (data.data as Record<string, unknown>)
      : null;

  let videoUrl: string | null = null;
  if (typeof data.video_url === 'string') videoUrl = data.video_url;
  else if (typeof data.url === 'string' && /\.(mp4|webm|mov)(\?|$)/i.test(data.url)) videoUrl = data.url;
  else if (output && typeof output.video_url === 'string') videoUrl = output.video_url;
  else if (videoObj && typeof videoObj.url === 'string') videoUrl = videoObj.url;
  else if (nestedData && typeof nestedData.video_url === 'string') videoUrl = nestedData.video_url;
  else if (typeof data.output === 'string' && data.output.startsWith('http')) videoUrl = data.output;
  else if (Array.isArray(data.output) && typeof data.output[0] === 'string') {
    videoUrl = data.output[0];
  } else if (Array.isArray(data.data) && data.data[0] && typeof (data.data[0] as Record<string, unknown>).url === 'string') {
    videoUrl = String((data.data[0] as Record<string, unknown>).url);
  }

  const taskId =
    (typeof data.task_id === 'string' && data.task_id) ||
    (typeof data.request_id === 'string' && data.request_id) ||
    (output && typeof output.task_id === 'string' && output.task_id) ||
    (typeof data.id === 'string' && data.id) ||
    null;

  const statusUrl =
    (typeof data.status_url === 'string' && data.status_url) ||
    (urlsObj && typeof urlsObj.get === 'string' && urlsObj.get) ||
    null;

  const responseUrl =
    (typeof data.response_url === 'string' && data.response_url) ||
    null;

  return { videoUrl, taskId, statusUrl, responseUrl };
}
