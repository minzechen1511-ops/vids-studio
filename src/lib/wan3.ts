import {
  DEFAULT_FREE_OPENROUTER_MODELS,
  type OpenRouterModelOption,
} from './openrouterModels';
import { modelIdentifierError } from './modelRouting';

export type { OpenRouterModelOption };

export type Wan3ModelId = 'wan3_0' | 'wan3_0_prime' | 'wan2_6' | 'wan2_7' | 'custom';
export type Wan3Resolution = '480p' | '720p' | '1080p';
export type Wan3AspectRatio = 'auto' | '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
export type Wan3MediaMode = 'frames' | 'references';
export type RemoteProviderHint =
  | 'auto'
  | 'openrouter'
  | 'huggingface-space'
  | 'dashscope'
  | 'fal'
  | 'replicate'
  | 'huggingface'
  | 'comfyui'
  | 'generic';

export interface WanModelSpec {
  id: Wan3ModelId;
  name: string;
  shortTag: string;
  subtitle: string;
  openWeight: boolean;
  supportsUnlim: boolean;
  resolutions: ReadonlyArray<Wan3Resolution>;
  resolutionParamName: 'resolution' | 'quality';
  aspectRatios: ReadonlyArray<Wan3AspectRatio>;
  durationType: 'range' | 'discrete';
  durationMin: number;
  durationMax: number;
  durationOptions?: ReadonlyArray<number>;
  supportsSmartDuration: boolean;
  supportsFrames: boolean;
  supportsReferences: boolean;
  supportsGenerateAudioParam: boolean;
  supportsEnableThinkingParam: boolean;
}

export interface CameraPreset {
  id: string;
  name: string;
  category: 'Linear' | 'Vertical' | 'Orbit' | 'Zoom' | 'Follow' | 'Specialty' | 'Static';
  description: string;
  promptPhrase: string;
  animationClass: string;
}

export interface StylePreset {
  id: string;
  name: string;
  lookDirective: string;
  colorGrade: string;
}


export interface ReferenceAsset {
  id: string;
  name: string;
  dataUrl: string;
  role: 'start_image' | 'end_image' | 'image_references';
}

export interface Wan3GenerationInput {
  modelId: Wan3ModelId;
  remoteModelId?: string;
  remoteEndpoint?: string;
  remoteProvider?: RemoteProviderHint;
  secretEnvName?: string;
  openrouterModel?: string;
  openrouterEndpoint?: string;
  rendererPresetId?: string;
  prompt: string;
  negativePrompt?: string;
  audioCue?: string;
  duration: number; // 2..30 or -1 for smart duration on wan3_0
  resolution: Wan3Resolution;
  aspectRatio: Wan3AspectRatio;
  generateAudio: boolean;
  enableThinking: boolean;
  singleShot?: boolean;
  cameraPresetId: string;
  stylePresetId: string;
  mediaMode: Wan3MediaMode;
  startImage?: ReferenceAsset | null;
  endImage?: ReferenceAsset | null;
  referenceImages?: ReferenceAsset[];
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface Wan3CompiledJob {
  model: string;
  compiledPrompt: string;
  parameters: Record<string, string | number | boolean>;
  medias: Array<{
    role: 'start_image' | 'end_image' | 'image_references';
    label: string;
    name: string;
  }>;
  cliCommand: string;
}

export const WAN_MODEL_SPECS: ReadonlyArray<WanModelSpec> = [
  {
    id: 'wan2_6',
    name: 'Wan 2.6 Video',
    shortTag: 'Open-Weight',
    subtitle: 'Open-weight model · Self-hostable for unlimited uncensored GPU runs · 5s/10s/15s · Stylized',
    openWeight: true,
    supportsUnlim: false,
    resolutions: ['720p', '1080p'],
    resolutionParamName: 'quality',
    aspectRatios: ['16:9', '9:16', '1:1'],
    durationType: 'discrete',
    durationMin: 5,
    durationMax: 15,
    durationOptions: [5, 10, 15],
    supportsSmartDuration: false,
    supportsFrames: false,
    supportsReferences: true,
    supportsGenerateAudioParam: false,
    supportsEnableThinkingParam: false,
  },
  {
    id: 'wan2_7',
    name: 'Wan 2.7',
    shortTag: 'Unlim-Tier',
    subtitle: 'Higgsfield Unlimited-plan eligible · Sync audio & character-consistent · 2–15s',
    openWeight: false,
    supportsUnlim: true,
    resolutions: ['720p', '1080p'],
    resolutionParamName: 'resolution',
    aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'],
    durationType: 'range',
    durationMin: 2,
    durationMax: 15,
    supportsSmartDuration: false,
    supportsFrames: true,
    supportsReferences: false,
    supportsGenerateAudioParam: false,
    supportsEnableThinkingParam: false,
  },
  {
    id: 'wan3_0',
    name: 'Wan 3.0',
    shortTag: 'Flagship',
    subtitle: '2–30s or Smart (-1) · Native Audio · Start/End Frames or Multimodal Refs',
    openWeight: false,
    supportsUnlim: false,
    resolutions: ['480p', '720p', '1080p'],
    resolutionParamName: 'resolution',
    aspectRatios: ['auto', '16:9', '9:16', '1:1', '4:3', '3:4'],
    durationType: 'range',
    durationMin: 2,
    durationMax: 30,
    supportsSmartDuration: true,
    supportsFrames: true,
    supportsReferences: true,
    supportsGenerateAudioParam: true,
    supportsEnableThinkingParam: true,
  },
  {
    id: 'wan3_0_prime',
    name: 'Wan 3.0 Prime',
    shortTag: 'Prime',
    subtitle: '2–30s or Smart (-1) · Prime Catalog Variant · Identical Parameter Surface',
    openWeight: false,
    supportsUnlim: false,
    resolutions: ['480p', '720p', '1080p'],
    resolutionParamName: 'resolution',
    aspectRatios: ['auto', '16:9', '9:16', '1:1', '4:3', '3:4'],
    durationType: 'range',
    durationMin: 2,
    durationMax: 30,
    supportsSmartDuration: true,
    supportsFrames: true,
    supportsReferences: true,
    supportsGenerateAudioParam: true,
    supportsEnableThinkingParam: true,
  },
  {
    id: 'custom',
    name: 'Custom Video Model',
    shortTag: 'Any Model',
    subtitle: 'Route any external model ID & endpoint (Kling, Hunyuan, LTX, Wan, Seedance, ComfyUI)',
    openWeight: false,
    supportsUnlim: false,
    resolutions: ['480p', '720p', '1080p'],
    resolutionParamName: 'resolution',
    aspectRatios: ['auto', '16:9', '9:16', '1:1', '4:3', '3:4'],
    durationType: 'range',
    durationMin: 2,
    durationMax: 30,
    supportsSmartDuration: false,
    supportsFrames: true,
    supportsReferences: true,
    supportsGenerateAudioParam: true,
    supportsEnableThinkingParam: true,
  },
];

export const WAN3_MODELS: ReadonlyArray<{
  id: Wan3ModelId;
  name: string;
  shortTag: string;
  subtitle: string;
}> = WAN_MODEL_SPECS.map((m) => ({
  id: m.id,
  name: m.name,
  shortTag: m.shortTag,
  subtitle: m.subtitle,
}));

export const WAN3_ASPECT_RATIOS: ReadonlyArray<Wan3AspectRatio> = [
  'auto',
  '16:9',
  '9:16',
  '1:1',
  '4:3',
  '3:4',
];

export const WAN3_RESOLUTIONS: ReadonlyArray<Wan3Resolution> = ['480p', '720p', '1080p'];

export const WAN3_DURATION_MIN = 2;
export const WAN3_DURATION_MAX = 30;
export const WAN3_SMART_DURATION = -1;
export const WAN3_MAX_IMAGE_REFS = 10;

export function getWanModelSpec(modelId: string): WanModelSpec | undefined {
  return WAN_MODEL_SPECS.find((m) => m.id === modelId);
}

/**
 * Safely snaps duration, resolution, aspect ratio, and media mode when switching models
 * so UI controls never leave invalid parameters behind.
 */
export function normalizeParamsForModel(
  nextModelId: Wan3ModelId,
  current: {
    duration: number;
    resolution: Wan3Resolution;
    aspectRatio: Wan3AspectRatio;
    mediaMode: Wan3MediaMode;
  }
): {
  duration: number;
  resolution: Wan3Resolution;
  aspectRatio: Wan3AspectRatio;
  mediaMode: Wan3MediaMode;
} {
  const spec = getWanModelSpec(nextModelId) || WAN_MODEL_SPECS[2];

  const resolution = spec.resolutions.includes(current.resolution)
    ? current.resolution
    : spec.resolutions[0];

  const aspectRatio = spec.aspectRatios.includes(current.aspectRatio)
    ? current.aspectRatio
    : spec.aspectRatios[0];

  let duration = current.duration;
  if (duration === WAN3_SMART_DURATION && !spec.supportsSmartDuration) {
    duration = spec.durationOptions?.[0] ?? 5;
  }
  if (spec.durationType === 'discrete' && spec.durationOptions) {
    if (!spec.durationOptions.includes(duration)) {
      const closest = spec.durationOptions.reduce((best, opt) =>
        Math.abs(opt - duration) < Math.abs(best - duration) ? opt : best
      );
      duration = closest;
    }
  } else if (duration !== WAN3_SMART_DURATION) {
    duration = Math.min(spec.durationMax, Math.max(spec.durationMin, Math.round(duration)));
  }

  let mediaMode = current.mediaMode;
  if (mediaMode === 'frames' && !spec.supportsFrames && spec.supportsReferences) {
    mediaMode = 'references';
  } else if (mediaMode === 'references' && !spec.supportsReferences && spec.supportsFrames) {
    mediaMode = 'frames';
  }

  return { duration, resolution, aspectRatio, mediaMode };
}

export const CAMERA_PRESETS: ReadonlyArray<CameraPreset> = [
  {
    id: 'static',
    name: 'Static Locked-Off',
    category: 'Static',
    description: 'Tripod-locked frame with zero camera movement; lets subject & environment move.',
    promptPhrase: 'Static locked-off camera, stable framing.',
    animationClass: '',
  },
  {
    id: 'dolly-in',
    name: 'Dolly In',
    category: 'Linear',
    description: 'Smooth linear track pushing toward the subject for intimacy or tension.',
    promptPhrase: 'Camera Dolly In smoothly toward the subject.',
    animationClass: 'cam-dolly-in',
  },
  {
    id: 'dolly-out',
    name: 'Dolly Out',
    category: 'Linear',
    description: 'Smooth linear pull back revealing surrounding environment and scale.',
    promptPhrase: 'Camera Dolly Out smoothly to reveal the wider environment.',
    animationClass: 'cam-dolly-out',
  },
  {
    id: 'dolly-left',
    name: 'Dolly Left',
    category: 'Linear',
    description: 'Lateral horizontal tracking move to the left.',
    promptPhrase: 'Camera Dolly Left tracking laterally beside the subject.',
    animationClass: 'cam-dolly-left',
  },
  {
    id: 'dolly-right',
    name: 'Dolly Right',
    category: 'Linear',
    description: 'Lateral horizontal tracking move to the right.',
    promptPhrase: 'Camera Dolly Right tracking laterally beside the subject.',
    animationClass: 'cam-dolly-right',
  },
  {
    id: 'crane-up',
    name: 'Crane Up',
    category: 'Vertical',
    description: 'Vertical rise from eye or ground level to reveal scope.',
    promptPhrase: 'Camera Crane Up smoothly rising to reveal the full scene.',
    animationClass: 'cam-crane-up',
  },
  {
    id: 'crane-down',
    name: 'Crane Down',
    category: 'Vertical',
    description: 'Vertical descent from high vantage point down onto the subject.',
    promptPhrase: 'Camera Crane Down smoothly descending toward the subject.',
    animationClass: 'cam-crane-down',
  },
  {
    id: '360-orbit',
    name: '360 Orbit',
    category: 'Orbit',
    description: 'Continuous circular arc orbiting around the focal subject.',
    promptPhrase: 'Camera performs a smooth 360 Orbit around the subject.',
    animationClass: 'cam-orbit',
  },
  {
    id: 'arc',
    name: 'Arc Sweep',
    category: 'Orbit',
    description: 'Semi-circular sweep around the subject for dramatic turning points.',
    promptPhrase: 'Camera Arcs in a smooth semi-circular sweep around the subject.',
    animationClass: 'cam-orbit',
  },
  {
    id: 'crash-zoom-in',
    name: 'Crash Zoom In',
    category: 'Zoom',
    description: 'Rapid sudden focal zoom punch into a detail or expression.',
    promptPhrase: 'Crash Zoom In rapidly onto the focal subject.',
    animationClass: 'cam-crash-zoom',
  },
  {
    id: 'handheld',
    name: 'Handheld',
    category: 'Follow',
    description: 'Organic handheld breathing and micro-motion for raw realism.',
    promptPhrase: 'Handheld camera with natural organic breathing and subtle motion.',
    animationClass: 'cam-handheld',
  },
  {
    id: 'fpv-drone',
    name: 'FPV Drone',
    category: 'Follow',
    description: 'Agile, fast-weaving aerial tracking shot.',
    promptPhrase: 'FPV Drone shot weaving swiftly through the space.',
    animationClass: 'cam-fpv',
  },
  {
    id: 'dutch-angle',
    name: 'Dutch Angle',
    category: 'Specialty',
    description: 'Canted horizon tilt creating unease, intensity, or kinetic styling.',
    promptPhrase: 'Dutch Angle tilted framing with slow push.',
    animationClass: 'cam-dutch',
  },
  {
    id: 'bullet-time',
    name: 'Bullet Time',
    category: 'Specialty',
    description: 'Slow-motion sweep circling a suspended or peak-action moment.',
    promptPhrase: 'Bullet Time slow-motion camera sweep around the subject.',
    animationClass: 'cam-orbit',
  },
];

export const STYLE_PRESETS: ReadonlyArray<StylePreset> = [
  {
    id: 'natural-raw',
    name: 'Natural / Faithful to Reference',
    lookDirective: 'Natural photorealistic rendering faithful to the reference lighting and textures.',
    colorGrade: 'Natural balanced contrast, clean skin and surface fidelity',
  },
  {
    id: 'cinematic',
    name: 'Cinematic 35mm',
    lookDirective: '35mm cinema film aesthetic, motivated practical lighting, shallow depth of field.',
    colorGrade: 'Teal shadows, warm tungsten highlights, rich contrast',
  },
  {
    id: 'anamorphic',
    name: 'Anamorphic Scope',
    lookDirective: 'Anamorphic lens aesthetic with subtle horizontal flares and oval bokeh.',
    colorGrade: 'High-contrast theatrical grade, crisp specular highlights',
  },
  {
    id: 'warm-nostalgia',
    name: 'Warm Nostalgia',
    lookDirective: 'Kodak Portra 400 look, soft afternoon glow, gentle film halation.',
    colorGrade: 'Golden amber highlights, lifted warm shadows',
  },
  {
    id: 'cold-thriller',
    name: 'Cold Thriller',
    lookDirective: 'Crisp low-key lighting, deep shadows, sharp foreground focus.',
    colorGrade: 'Desaturated slate blue-grey, crushed blacks',
  },
  {
    id: 'noir',
    name: 'High-Contrast Noir',
    lookDirective: 'Chiaroscuro directional lighting, stark shadow geometry.',
    colorGrade: 'High-contrast monochrome black and white',
  },
  {
    id: 'vhs',
    name: 'Analog VHS',
    lookDirective: 'Retro analog camcorder texture, slight chromatic bleed, authentic grain.',
    colorGrade: 'Warm analog tape tones, soft shadow roll-off',
  },
  {
    id: 'super-8mm',
    name: 'Super 8MM',
    lookDirective: 'Super 8MM vintage film stock, warm organic grain, soft edge vignette.',
    colorGrade: 'Nostalgic faded emulsion, warm highlights',
  },
];

export const OPENROUTER_PRESET_MODELS: ReadonlyArray<OpenRouterModelOption> =
  DEFAULT_FREE_OPENROUTER_MODELS;

export const STARTER_REFERENCES = [
  {
    id: 'starter-alley-rider',
    title: 'Night Alley Rider',
    aspectRatio: '16:9' as Wan3AspectRatio,
    imageUrl: '/src/assets/images/sample_cinematic_scene_1795242162857.jpg',
    suggestedPrompt:
      'The rider slowly turns his head toward the glowing motorcycle headlight as mist drifts past the brick walls, leather jacket creaking subtly as rain droplets shimmer on the cobblestones.',
    cameraId: 'dolly-in',
    styleId: 'cinematic',
  },
  {
    id: 'starter-concrete-editorial',
    title: 'Brutalist Gallery Portrait',
    aspectRatio: '3:4' as Wan3AspectRatio,
    imageUrl: '/src/assets/images/sample_studio_portrait_1795242162516.jpg',
    suggestedPrompt:
      'She turns gracefully toward the tall concrete window, soft daylight shifting across the tailored wool coat as dust motes float through the shaft of light.',
    cameraId: '360-orbit',
    styleId: 'natural-raw',
  },
];

export function getEffectiveModelId(input: Pick<Wan3GenerationInput, 'modelId' | 'remoteModelId'>): string {
  const override = input.remoteModelId?.trim();
  if (input.modelId === 'custom') {
    return override || 'custom';
  }
  return override || input.modelId;
}

export function validateWan3Payload(input: Wan3GenerationInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const spec = getWanModelSpec(input.modelId);

  const identifierError = modelIdentifierError(input.remoteModelId || '');
  if (identifierError) errors.push(identifierError);

  if (!spec) {
    errors.push(
      `Unsupported model "${input.modelId}". Expected wan2_6, wan2_7, wan3_0, wan3_0_prime, or custom.`
    );
    return { valid: false, errors, warnings };
  }

  if (input.modelId === 'custom' && (!input.remoteModelId || !input.remoteModelId.trim())) {
    errors.push('Custom Video Model ID is required when using Custom Video Model mode.');
  }

  if (!input.prompt || input.prompt.trim().length === 0) {
    errors.push('Prompt text is required.');
  }

  const isSmartDuration = input.duration === WAN3_SMART_DURATION;
  if (isSmartDuration) {
    if (!spec.supportsSmartDuration) {
      errors.push(`${spec.name} does not support smart duration (-1).`);
    } else {
      warnings.push('Smart duration (-1) lets Wan 3.0 pick clip length and is billed as 10s.');
    }
  } else if (spec.durationType === 'discrete' && spec.durationOptions) {
    if (!spec.durationOptions.includes(input.duration)) {
      errors.push(
        `${spec.name} supports durations of ${spec.durationOptions.join(', ')} seconds.`
      );
    }
  } else {
    const isValidFixedDuration =
      Number.isInteger(input.duration) &&
      input.duration >= spec.durationMin &&
      input.duration <= spec.durationMax;
    if (!isValidFixedDuration) {
      errors.push(
        `Duration for ${spec.name} must be an integer between ${spec.durationMin} and ${spec.durationMax} seconds${
          spec.supportsSmartDuration ? ', or -1 for smart duration' : ''
        }.`
      );
    }
  }

  if (!spec.resolutions.includes(input.resolution)) {
    errors.push(
      `Invalid ${spec.resolutionParamName} "${input.resolution}" for ${spec.name}. Choose ${spec.resolutions.join(', ')}.`
    );
  }

  if (!spec.aspectRatios.includes(input.aspectRatio)) {
    errors.push(
      `Invalid aspect ratio "${input.aspectRatio}" for ${spec.name}. Supported: ${spec.aspectRatios.join(', ')}.`
    );
  }

  const hasStart = Boolean(input.startImage);
  const hasEnd = Boolean(input.endImage);
  const refCount = input.referenceImages ? input.referenceImages.length : 0;

  if (input.mediaMode === 'frames') {
    if (!spec.supportsFrames) {
      errors.push(
        `${spec.name} uses Reference Photos (image_references) rather than start/end frame slots.`
      );
    } else {
      if (hasEnd && !hasStart) {
        errors.push(`${spec.name} rule: end_image requires start_image to be provided.`);
      }
      if (refCount > 0 && (hasStart || hasEnd)) {
        errors.push(
          `${spec.name} rule: start/end frame images cannot be combined with reference media in the same call.`
        );
      }
    }
  } else {
    if (!spec.supportsReferences) {
      errors.push(`${spec.name} uses Start / End Frame mode (start_image / end_image).`);
    } else {
      if (refCount > WAN3_MAX_IMAGE_REFS) {
        errors.push(`${spec.name} supports up to ${WAN3_MAX_IMAGE_REFS} reference images per call.`);
      }
      if (hasStart || hasEnd) {
        errors.push(
          `${spec.name} rule: switch to Frame Mode to use start_image / end_image, or clear frame slots.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function compileWan3Prompt(input: Wan3GenerationInput): string {
  const parts: string[] = [];
  const raw = input.prompt.trim();
  const lower = raw.toLowerCase();
  const spec = getWanModelSpec(input.modelId);

  if (input.singleShot && !lower.includes('generate single shot')) {
    parts.push('Generate single shot.');
  }

  // Reference citation numbering per Wan prompting dialect
  if (!lower.includes('image 1')) {
    if (input.mediaMode === 'frames') {
      if (input.startImage && input.endImage) {
        parts.push('Animate seamlessly from Image 1 (opening frame) to Image 2 (closing frame).');
      } else if (input.startImage) {
        parts.push('Starting from Image 1 as the opening frame.');
      }
    } else if (input.referenceImages && input.referenceImages.length > 0) {
      const citations = input.referenceImages
        .map((img, idx) => `Image ${idx + 1} (${img.name || 'reference'})`)
        .join(', ');
      parts.push(`Reference visual subject and aesthetics from ${citations}.`);
    }
  }

  // User creative prompt verbatim (zero censorship/rewriting)
  parts.push(raw);

  // Camera movement preset
  const camera = CAMERA_PRESETS.find((c) => c.id === input.cameraPresetId);
  if (camera && !lower.includes(camera.promptPhrase.toLowerCase())) {
    parts.push(`Camera: ${camera.promptPhrase}`);
  }

  // Visual style / look
  const style = STYLE_PRESETS.find((s) => s.id === input.stylePresetId);
  if (style && !lower.includes('look:') && !lower.includes('style:')) {
    parts.push(`Style: ${style.lookDirective} ${style.colorGrade}.`);
  }

  // Audio direction
  if (spec?.supportsGenerateAudioParam ? input.generateAudio : Boolean(input.audioCue?.trim())) {
    if (input.audioCue && input.audioCue.trim().length > 0 && !lower.includes('audio:')) {
      parts.push(`Audio: ${input.audioCue.trim()}`);
    }
  } else if (spec?.supportsGenerateAudioParam && !input.generateAudio && !lower.includes('no background music')) {
    parts.push('No dialogue. No background music.');
  }

  // Negative prompt list
  if (
    input.negativePrompt &&
    input.negativePrompt.trim().length > 0 &&
    !lower.includes('negative prompt:')
  ) {
    parts.push(`Negative prompt: ${input.negativePrompt.trim()}`);
  }

  return parts.join('\n\n');
}

export function buildWan3CompiledJob(input: Wan3GenerationInput): Wan3CompiledJob {
  const compiledPrompt = compileWan3Prompt(input);
  const spec = getWanModelSpec(input.modelId) || WAN_MODEL_SPECS[2];
  const effectiveModel = getEffectiveModelId(input);

  const medias: Wan3CompiledJob['medias'] = [];
  if (input.mediaMode === 'frames' && spec.supportsFrames) {
    if (input.startImage) {
      medias.push({
        role: 'start_image',
        label: 'Image 1 (Start Frame)',
        name: input.startImage.name,
      });
    }
    if (input.endImage) {
      medias.push({
        role: 'end_image',
        label: 'Image 2 (End Frame)',
        name: input.endImage.name,
      });
    }
  } else if (input.referenceImages && spec.supportsReferences) {
    input.referenceImages.forEach((img, index) => {
      medias.push({
        role: 'image_references',
        label: `Image ${index + 1}`,
        name: img.name,
      });
    });
  }

  const parameters: Record<string, string | number | boolean> = {
    duration: input.duration,
    [spec.resolutionParamName]: input.resolution,
    aspect_ratio: input.aspectRatio,
  };
  if (spec.supportsGenerateAudioParam) {
    parameters.generate_audio = input.generateAudio;
  }
  if (spec.supportsEnableThinkingParam) {
    parameters.enable_thinking = input.enableThinking;
  }

  const escapedPrompt = compiledPrompt.replace(/"/g, '\\"').replace(/\n+/g, ' ');
  const mediaFlags = medias.map((m) => `--media ${m.role}="${m.name}"`).join(' ');
  const paramFlags = Object.entries(parameters)
    .map(([k, v]) => `--param ${k}=${v}`)
    .join(' ');

  const cliCommand = [
    `higgsfield generate create`,
    `--model ${effectiveModel}`,
    `--prompt "${escapedPrompt}"`,
    paramFlags,
    mediaFlags,
  ]
    .filter(Boolean)
    .join(' ');

  return {
    model: effectiveModel,
    compiledPrompt,
    parameters,
    medias,
    cliCommand,
  };
}
