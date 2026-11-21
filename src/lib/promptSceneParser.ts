import {
  getWanModelSpec,
  type Wan3AspectRatio,
  type Wan3GenerationInput,
  type Wan3Resolution,
} from './wan3';

export interface PromptVfxFlags {
  rain: boolean;
  snow: boolean;
  mist: boolean;
  embers: boolean;
  neonGlow: boolean;
  sunbeams: boolean;
  lightning: boolean;
  dustMotes: boolean;
}

export type AudioProfileType = 'rain' | 'wind' | 'engine' | 'fire' | 'melodic' | 'night-ambience';

export type BeatActionType =
  | 'walk-left'
  | 'walk-right'
  | 'approach'
  | 'retreat'
  | 'turn-left'
  | 'turn-right'
  | 'rise'
  | 'fall'
  | 'orbit'
  | 'sprint'
  | 'shake'
  | 'idle';

export type BeatTransitionType = 'cut' | 'dissolve' | 'wipe-left' | 'wipe-right' | 'flash';

export interface BeatFocalRegion {
  x: number; // 0..1 normalized horizontal focus center
  y: number; // 0..1 normalized vertical focus center
  zoom: number; // 1.0..1.9 framing zoom multiplier
}

export interface ShotBeat {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
  transition: BeatTransitionType;
  action: BeatActionType;
  cameraOverrideId: string | null;
  imageIndices: number[];
  focalRegion: BeatFocalRegion;
  lightingTint?: string | null;
  vfx: PromptVfxFlags;
  speedMultiplier: number;
}

export interface AiDirectorBeatInput {
  startSec?: number;
  endSec?: number;
  text?: string;
  action?: string;
  transition?: string;
  cameraPresetId?: string | null;
  imageIndex?: number | null;
  imageIndices?: number[];
  focalX?: number;
  focalY?: number;
  zoom?: number;
  lightingTint?: string | null;
  speedMultiplier?: number;
  vfx?: Partial<PromptVfxFlags>;
}

export interface AiDirectorPlan {
  directorModel?: string;
  accentColor?: string;
  secondaryColor?: string;
  audioProfile?: AudioProfileType;
  beats?: AiDirectorBeatInput[];
}

export interface ParsedPromptChoreography {
  durationSec: number;
  width: number;
  height: number;
  speedMultiplier: number;
  cameraOverrideId: string | null;
  vfx: PromptVfxFlags;
  accentColor: string;
  secondaryColor: string;
  audioEnabled: boolean;
  audioProfile: AudioProfileType;
  directorModel?: string | null;
  beats: ShotBeat[];
}

export function resolveOutputDimensions(
  aspectRatio: Wan3AspectRatio,
  resolution: Wan3Resolution,
  imageAspect?: number | null
): { width: number; height: number } {
  const shortSide = resolution === '1080p' ? 1080 : resolution === '480p' ? 480 : 720;

  let ratio = 16 / 9;
  if (aspectRatio === 'auto' && imageAspect && imageAspect > 0.1 && imageAspect < 10) {
    ratio = imageAspect;
  } else if (aspectRatio === '9:16') {
    ratio = 9 / 16;
  } else if (aspectRatio === '1:1') {
    ratio = 1;
  } else if (aspectRatio === '4:3') {
    ratio = 4 / 3;
  } else if (aspectRatio === '3:4') {
    ratio = 3 / 4;
  }

  let width: number;
  let height: number;
  if (ratio >= 1) {
    height = shortSide;
    width = Math.round(shortSide * ratio);
  } else {
    width = shortSide;
    height = Math.round(shortSide / ratio);
  }

  // Ensure even dimensions required by video encoders
  width = width % 2 === 0 ? width : width + 1;
  height = height % 2 === 0 ? height : height + 1;

  return { width, height };
}

function detectCameraFromPrompt(text: string): string | null {
  const lower = text.toLowerCase();
  if (/\b(360\s*orbit|orbit\s*around|circle\s*around|spins?\s*around)\b/.test(lower)) return '360-orbit';
  if (/\b(crash\s*zoom|whip\s*zoom|snap\s*zoom)\b/.test(lower)) return 'crash-zoom-in';
  if (/\b(fpv|drone\s*weave|aerial\s*weave|fly(?:ing)?\s*through)\b/.test(lower)) return 'fpv-drone';
  if (/\b(dutch\s*angle|tilted\s*horizon)\b/.test(lower)) return 'dutch-angle';
  if (/\b(crane\s*up|rise\s*up|pedestal\s*up|tilt\s*up)\b/.test(lower)) return 'crane-up';
  if (/\b(crane\s*down|descend|tilt\s*down)\b/.test(lower)) return 'crane-down';
  if (/\b(dolly\s*out|pull\s*back|zoom\s*out|wide\s*shot)\b/.test(lower)) return 'dolly-out';
  if (/\b(dolly\s*left|pan\s*left|track\s*left)\b/.test(lower)) return 'dolly-left';
  if (/\b(dolly\s*right|pan\s*right|track\s*right)\b/.test(lower)) return 'dolly-right';
  if (/\b(dolly\s*in|push\s*in|zoom\s*in|close[\s-]*up)\b/.test(lower)) return 'dolly-in';
  if (/\b(handheld|shaky|documentary|tremble)\b/.test(lower)) return 'handheld';
  return null;
}

function detectBeatAction(text: string): BeatActionType {
  const lower = text.toLowerCase();
  if (/\b(sprint|sprints|sprinting|dash|dashes|dashing|chase|chases|chasing|rush|rushes|rushing|race|races|racing|speeds?\s*off|speeding\s*off)\b/.test(lower)) {
    return 'sprint';
  }
  if (/\b(shake|shakes|shaking|impact|explosion|tremor|quiver|quivers|quivering|vibrate|vibrates|vibrating)\b/.test(lower)) {
    return 'shake';
  }
  if (/\b(walk|walks|walking|step|steps|stepping|move|moves|moving|glide|glides|gliding|drift|drifts|drifting|cross|crosses|crossing|stroll|strolls|strolling)\s+(?:to\s+the\s+|toward\s+the\s+)?left\b|\bfrom\s+right\s+to\s+left\b/.test(lower)) {
    return 'walk-left';
  }
  if (/\b(walk|walks|walking|step|steps|stepping|move|moves|moving|glide|glides|gliding|drift|drifts|drifting|cross|crosses|crossing|stroll|strolls|strolling)\s+(?:to\s+the\s+|toward\s+the\s+)?right\b|\bfrom\s+left\s+to\s+right\b/.test(lower)) {
    return 'walk-right';
  }
  if (/\b(turn|turns|turning|look|looks|looking|glance|glances|glancing|rotate|rotates|rotating|face|faces|facing)\s+(?:to\s+the\s+|toward\s+the\s+)?left\b/.test(lower)) {
    return 'turn-left';
  }
  if (/\b(turn|turns|turning|look|looks|looking|glance|glances|glancing|rotate|rotates|rotating|face|faces|facing)\s+(?:to\s+the\s+|toward\s+the\s+)?right\b/.test(lower)) {
    return 'turn-right';
  }
  if (/\b(approach|approaches|approaching|steps?\s*forward|stepping\s*forward|walks?\s*toward|walking\s*toward|leans?\s*in|leaning\s*in|comes?\s*closer|coming\s*closer|reach|reaches|reaching)\b/.test(lower)) {
    return 'approach';
  }
  if (/\b(retreat|retreats|retreating|steps?\s*back|stepping\s*back|backs?\s*away|backing\s*away|walks?\s*away|walking\s*away|recede|recedes|receding)\b/.test(lower)) {
    return 'retreat';
  }
  if (/\b(jump|jumps|jumping|leap|leaps|leaping|rise|rises|rising|lift|lifts|lifting|floats?\s*up|floating\s*up|ascend|ascends|ascending|fly|flies|flying|stands?\s*up|standing\s*up)\b/.test(lower)) {
    return 'rise';
  }
  if (/\b(fall|falls|falling|drop|drops|dropping|sink|sinks|sinking|sit|sits|sitting|kneel|kneels|kneeling|descend|descends|descending|crouch|crouches|crouching)\b/.test(lower)) {
    return 'fall';
  }
  if (/\b(orbit|orbits|orbiting|circle|circles|circling|spin|spins|spinning|swirl|swirls|swirling|turns?\s*around|turning\s*around)\b/.test(lower)) {
    return 'orbit';
  }
  if (/\b(walk|walks|walking|stroll|strolls|strolling|pace|paces|pacing)\b/.test(lower)) {
    return 'walk-right';
  }
  return 'idle';
}

function detectBeatTransition(text: string, isFirstBeat: boolean): BeatTransitionType {
  const lower = text.toLowerCase();
  if (/\b(flash|strobe|lightning\s*cut)\b/.test(lower)) return 'flash';
  if (/\b(wipe\s*left)\b/.test(lower)) return 'wipe-left';
  if (/\b(wipe\s*right|wipe)\b/.test(lower)) return 'wipe-right';
  if (/\b(hard\s*cut|cut\s*to|smash\s*cut|jump\s*cut)\b/.test(lower)) return 'cut';
  if (/\b(dissolve|fade|morph|blend|interpolat)\b/.test(lower)) return 'dissolve';
  return isFirstBeat ? 'dissolve' : 'cut';
}

function parseVfxFromText(text: string, negativePrompt: string): PromptVfxFlags {
  const lower = text.toLowerCase();
  const neg = negativePrompt.toLowerCase();
  return {
    rain: /\b(rain|raindrop|raindrops|downpour|drizzle|storm|wet cobblestones)\b/.test(lower) && !/\b(rain|raindrops|storm)\b/.test(neg),
    snow: /\b(snow|snowfall|blizzard|frost|flurry|ice crystals)\b/.test(lower) && !/\b(snow|snowfall|frost)\b/.test(neg),
    mist: /\b(mist|fog|haze|steam|smoke|vapor|cloud)\b/.test(lower) && !/\b(fog|mist|smoke|haze)\b/.test(neg),
    embers: /\b(fire|flame|ember|embers|spark|sparks|candle|candlelight|torch|inferno)\b/.test(lower) && !/\b(fire|flame|ember|embers|spark|sparks|candle)\b/.test(neg),
    neonGlow: /\b(neon|cyberpunk|magenta|cyan|laser|club|strobe|headlight|glowing)\b/.test(lower) && !/\b(neon|glow|strobe)\b/.test(neg),
    sunbeams: /\b(sun|sunlight|sunbeam|golden hour|daylight|shaft of light|dawn|sunset)\b/.test(lower) && !/\b(sun|sunlight|flare)\b/.test(neg),
    lightning: /\b(lightning|thunder|thunderstorm|flash)\b/.test(lower) && !/\b(flicker|flash|lightning)\b/.test(neg),
    dustMotes: /\b(dust|motes|particles|pollen|floating|silk|window)\b/.test(lower) && !/\b(dust|particles)\b/.test(neg),
  };
}

function detectBeatSpeed(text: string): number {
  const lower = text.toLowerCase();
  if (/\b(slow[\s-]*motion|slowly|gentle|calm|drift|languid)\b/.test(lower)) return 0.65;
  if (/\b(fast|rapid|sprint|chase|rush|kinetic|frantic|hyper)\b/.test(lower)) return 1.55;
  return 1;
}

function detectFocalRegion(text: string): BeatFocalRegion {
  const lower = text.toLowerCase();
  let x = 0.5;
  let y = 0.48;
  let zoom = 1.04;

  if (/\b(face|eyes|portrait|head|expression|smile|gaze|close[\s-]*up|profile|visor|helmet)\b/.test(lower)) {
    y = 0.34;
    zoom = 1.32;
  } else if (/\b(hand|hands|drink|coffee|cup|hold|holding|grab|jacket|chest|waist)\b/.test(lower)) {
    y = 0.56;
    zoom = 1.24;
  } else if (/\b(foot|feet|shoes|boots|ground|pavement|cobblestone|wheel|tire|road|floor)\b/.test(lower)) {
    y = 0.76;
    zoom = 1.22;
  } else if (/\b(sky|ceiling|overhead|drone|moon|clouds|rooftop)\b/.test(lower)) {
    y = 0.24;
    zoom = 1.18;
  }

  if (/\b(left\s+side|on\s+the\s+left|to\s+the\s+left)\b/.test(lower)) {
    x = 0.34;
  } else if (/\b(right\s+side|on\s+the\s+right|to\s+the\s+right)\b/.test(lower)) {
    x = 0.66;
  }

  if (/\b(wide\s+shot|establishing|full\s+body|pull\s+back|panoramic)\b/.test(lower)) {
    zoom = 1.0;
  }

  return { x, y, zoom };
}

function resolveBeatImageIndices(
  beatText: string,
  beatIdx: number,
  totalBeats: number,
  imageNames: string[]
): number[] {
  const count = imageNames.length;
  if (count <= 0) return [];
  if (count === 1) return [0];

  const found = new Set<number>();
  const lower = beatText.toLowerCase();

  // Explicit "Image 1", "Image 2", "img 1", "photo 2", "frame 1", "start frame", "end frame"
  const imgMatches = lower.matchAll(/\b(?:image|img|photo|ref|reference|frame)\s*#?\s*(\d+)\b/g);
  for (const m of imgMatches) {
    const idx = Number(m[1]) - 1;
    if (Number.isInteger(idx) && idx >= 0 && idx < count) {
      found.add(idx);
    }
  }

  if (/\b(opening frame|start frame|first photo|first image)\b/.test(lower)) {
    found.add(0);
  }
  if (/\b(closing frame|end frame|final frame|last photo|last image)\b/.test(lower)) {
    found.add(count - 1);
  }

  // Match uploaded filename stem if referenced in the beat
  imageNames.forEach((rawName, idx) => {
    const stem = rawName
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim()
      .toLowerCase();
    if (stem.length >= 4 && lower.includes(stem)) {
      found.add(idx);
    }
  });

  if (found.size > 0) {
    return Array.from(found).sort((a, b) => a - b);
  }

  // If user didn't cite a specific image in this beat:
  // - Single beat spanning multiple photos uses all uploaded photos in sequence/blend
  // - Multi-beat script maps each beat chronologically to its corresponding photo slice
  if (totalBeats <= 1) {
    return Array.from({ length: count }, (_, i) => i);
  }
  const mappedIdx = Math.min(count - 1, Math.floor((beatIdx / totalBeats) * count));
  return [mappedIdx];
}

function collectInputImageNames(input: Wan3GenerationInput): string[] {
  if (input.mediaMode === 'frames') {
    const names: string[] = [];
    if (input.startImage?.dataUrl) names.push(input.startImage.name || 'start_frame');
    if (input.endImage?.dataUrl) names.push(input.endImage.name || 'end_frame');
    return names;
  }
  return (input.referenceImages || [])
    .filter((r) => Boolean(r.dataUrl))
    .map((r) => r.name || 'reference');
}

function splitIntoBeats(
  prompt: string,
  durationSec: number,
  singleShot: boolean,
  negativePrompt: string,
  audioCue: string,
  imageNames: string[]
): ShotBeat[] {
  const clean = prompt.trim();
  const buildBeat = (
    index: number,
    startSec: number,
    endSec: number,
    text: string,
    totalBeats: number,
    explicitTransition?: BeatTransitionType
  ): ShotBeat => {
    const combinedText = totalBeats === 1 && audioCue ? `${text} ${audioCue}` : text;
    return {
      index,
      startSec,
      endSec,
      text,
      transition: explicitTransition || detectBeatTransition(text, index === 0),
      action: detectBeatAction(text),
      cameraOverrideId: detectCameraFromPrompt(text),
      imageIndices: resolveBeatImageIndices(text, index, totalBeats, imageNames),
      focalRegion: detectFocalRegion(text),
      lightingTint: null,
      vfx: parseVfxFromText(combinedText, negativePrompt),
      speedMultiplier: detectBeatSpeed(text),
    };
  };

  if (!clean) {
    return [buildBeat(0, 0, durationSec, '', 1, 'dissolve')];
  }

  // Match explicit Wan 3.0 multi-shot blocks: Shot 1 [0-4s]: ...
  const shotRegex = /Shot\s*\d+\s*[\[(](\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)s?[\])]\s*:?\s*([^\n]+)/gi;
  const explicitMatches = Array.from(clean.matchAll(shotRegex));

  if (explicitMatches.length > 0 && !singleShot) {
    return explicitMatches.map((m, i) =>
      buildBeat(
        i,
        Math.max(0, Math.min(durationSec, Number(m[1]))),
        Math.max(0.5, Math.min(durationSec, Number(m[2]))),
        m[3].trim(),
        explicitMatches.length
      )
    );
  }

  // Split by sentences/clauses/newlines when multi-shot is enabled OR multiple distinct timed/script lines exist
  const hasMultilineScript = clean.includes('\n');
  const shouldSplitClauses = !singleShot || (hasMultilineScript && explicitMatches.length > 0);
  if (!shouldSplitClauses) {
    // Even in single-shot mode, if the prompt explicitly names multiple sentences with different actions/Image N references,
    // allow beat-by-beat choreography inside the single continuous shot using smooth 'dissolve' / motion transitions
    const sentenceChunks = clean
      .split(/(?<=[.!?])\s+|\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .slice(0, 6);

    const hasSequentialScriptSignals =
      sentenceChunks.length > 1 &&
      sentenceChunks.some((s) => /\b(image\s*\d+|then|next|after|finally|meanwhile|suddenly)\b/i.test(s));

    if (hasSequentialScriptSignals) {
      const step = durationSec / sentenceChunks.length;
      return sentenceChunks.map((text, idx) =>
        buildBeat(
          idx,
          Number((idx * step).toFixed(2)),
          Number(((idx + 1) * step).toFixed(2)),
          text,
          sentenceChunks.length,
          'dissolve'
        )
      );
    }

    return [buildBeat(0, 0, durationSec, clean, 1, 'dissolve')];
  }

  const chunks = clean
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 8);

  if (chunks.length <= 1) {
    return [buildBeat(0, 0, durationSec, clean, 1, 'dissolve')];
  }

  const step = durationSec / chunks.length;
  return chunks.map((text, idx) =>
    buildBeat(
      idx,
      Number((idx * step).toFixed(2)),
      Number(((idx + 1) * step).toFixed(2)),
      text,
      chunks.length
    )
  );
}

const VALID_ACTIONS = new Set<BeatActionType>([
  'walk-left',
  'walk-right',
  'approach',
  'retreat',
  'turn-left',
  'turn-right',
  'rise',
  'fall',
  'orbit',
  'sprint',
  'shake',
  'idle',
]);

const VALID_TRANSITIONS = new Set<BeatTransitionType>([
  'cut',
  'dissolve',
  'wipe-left',
  'wipe-right',
  'flash',
]);

export function parsePromptChoreography(
  input: Wan3GenerationInput,
  imageAspect?: number | null,
  aiPlan?: AiDirectorPlan | null
): ParsedPromptChoreography {
  const durationSec = input.duration === -1 ? 10 : Math.max(1, input.duration);
  const { width, height } = resolveOutputDimensions(
    input.aspectRatio,
    input.resolution,
    imageAspect
  );

  const combined = `${input.prompt} ${input.audioCue || ''}`;
  const combinedLower = combined.toLowerCase();
  const neg = input.negativePrompt || '';

  const speedMultiplier = detectBeatSpeed(combined);
  const vfx = parseVfxFromText(combined, neg);

  let accentColor = aiPlan?.accentColor || '#E5A93C';
  let secondaryColor = aiPlan?.secondaryColor || '#38BDF8';
  if (!aiPlan?.accentColor) {
    if (/\b(crimson|red|blood|ruby|rose)\b/.test(combinedLower)) {
      accentColor = '#EF4444';
    } else if (/\b(neon|magenta|pink|violet|purple)\b/.test(combinedLower)) {
      accentColor = '#E879F9';
      secondaryColor = '#22D3EE';
    } else if (/\b(cyan|ice|blue|frost|cold|moonlight)\b/.test(combinedLower)) {
      accentColor = '#38BDF8';
      secondaryColor = '#818CF8';
    } else if (/\b(emerald|forest|green|jungle|toxic)\b/.test(combinedLower)) {
      accentColor = '#34D399';
    }
  }

  const spec = getWanModelSpec(input.modelId);
  const audioEnabled = spec?.supportsGenerateAudioParam
    ? input.generateAudio
    : Boolean(input.generateAudio || input.audioCue?.trim());

  let audioProfile: AudioProfileType = aiPlan?.audioProfile || 'night-ambience';
  if (!aiPlan?.audioProfile) {
    if (vfx.rain || /\b(rain|ocean|water|waves|thunder)\b/.test(combinedLower)) {
      audioProfile = 'rain';
    } else if (vfx.embers || /\b(fire|crackle|hearth|campfire)\b/.test(combinedLower)) {
      audioProfile = 'fire';
    } else if (/\b(motorcycle|engine|car|traffic|city|drone|hum|machinery|cyberpunk)\b/.test(combinedLower)) {
      audioProfile = 'engine';
    } else if (/\b(wind|breeze|snow|mountain|desert|alley|mist)\b/.test(combinedLower)) {
      audioProfile = 'wind';
    } else if (/\b(music|piano|synth|violin|melody|dream|ethereal)\b/.test(combinedLower)) {
      audioProfile = 'melodic';
    }
  }

  // Use explicit camera preset unless user left Static and specified a camera move inside the prompt
  const cameraOverrideId =
    input.cameraPresetId === 'static' ? detectCameraFromPrompt(input.prompt) : null;

  const imageNames = collectInputImageNames(input);
  let beats = splitIntoBeats(
    input.prompt,
    durationSec,
    Boolean(input.singleShot),
    neg,
    input.audioCue || '',
    imageNames
  );

  // Merge AI Director's structured beat-by-beat choreography when provided
  if (aiPlan?.beats && Array.isArray(aiPlan.beats) && aiPlan.beats.length > 0) {
    const rawAiBeats = aiPlan.beats.slice(0, 8);
    const step = durationSec / rawAiBeats.length;
    const imgCount = imageNames.length;
    const negVfx = parseVfxFromText('', neg); // just to compute negative blockers cleanly

    beats = rawAiBeats.map((b, idx) => {
      const startSec =
        typeof b.startSec === 'number' && Number.isFinite(b.startSec)
          ? Math.max(0, Math.min(durationSec - 0.2, b.startSec))
          : Number((idx * step).toFixed(2));
      const endSec =
        typeof b.endSec === 'number' && Number.isFinite(b.endSec)
          ? Math.max(startSec + 0.3, Math.min(durationSec, b.endSec))
          : Number(((idx + 1) * step).toFixed(2));

      const beatText = typeof b.text === 'string' && b.text.trim() ? b.text.trim() : input.prompt;
      const ruleVfx = parseVfxFromText(beatText, neg);
      const mergedVfx: PromptVfxFlags = {
        rain: (b.vfx?.rain ?? ruleVfx.rain) && !/\b(rain|raindrops|storm)\b/i.test(neg),
        snow: (b.vfx?.snow ?? ruleVfx.snow) && !/\b(snow|snowfall|frost)\b/i.test(neg),
        mist: (b.vfx?.mist ?? ruleVfx.mist) && !/\b(fog|mist|smoke|haze)\b/i.test(neg),
        embers: (b.vfx?.embers ?? ruleVfx.embers) && !/\b(fire|flame|ember|embers)\b/i.test(neg),
        neonGlow: (b.vfx?.neonGlow ?? ruleVfx.neonGlow) && !/\b(neon|glow|strobe)\b/i.test(neg),
        sunbeams: (b.vfx?.sunbeams ?? ruleVfx.sunbeams) && !/\b(sun|sunlight|flare)\b/i.test(neg),
        lightning: (b.vfx?.lightning ?? ruleVfx.lightning) && !/\b(flicker|flash|lightning)\b/i.test(neg),
        dustMotes: (b.vfx?.dustMotes ?? ruleVfx.dustMotes) && !/\b(dust|particles)\b/i.test(neg),
      };
      void negVfx;

      let beatImageIndices: number[] = [];
      if (imgCount > 0) {
        if (Array.isArray(b.imageIndices) && b.imageIndices.length > 0) {
          beatImageIndices = b.imageIndices.filter(
            (n) => Number.isInteger(n) && n >= 0 && n < imgCount
          );
        } else if (typeof b.imageIndex === 'number' && Number.isInteger(b.imageIndex)) {
          if (b.imageIndex >= 0 && b.imageIndex < imgCount) {
            beatImageIndices = [b.imageIndex];
          }
        }
        if (beatImageIndices.length === 0) {
          beatImageIndices = resolveBeatImageIndices(
            beatText,
            idx,
            rawAiBeats.length,
            imageNames
          );
        }
      }

      const rawAction = (b.action || '').trim() as BeatActionType;
      const action: BeatActionType = VALID_ACTIONS.has(rawAction)
        ? rawAction
        : detectBeatAction(beatText);

      const rawTransition = (b.transition || '').trim() as BeatTransitionType;
      const transition: BeatTransitionType = VALID_TRANSITIONS.has(rawTransition)
        ? rawTransition
        : detectBeatTransition(beatText, idx === 0);

      const fallbackFocal = detectFocalRegion(beatText);
      const focalRegion: BeatFocalRegion = {
        x:
          typeof b.focalX === 'number' && Number.isFinite(b.focalX)
            ? Math.max(0.15, Math.min(0.85, b.focalX))
            : fallbackFocal.x,
        y:
          typeof b.focalY === 'number' && Number.isFinite(b.focalY)
            ? Math.max(0.15, Math.min(0.85, b.focalY))
            : fallbackFocal.y,
        zoom:
          typeof b.zoom === 'number' && Number.isFinite(b.zoom)
            ? Math.max(1.0, Math.min(1.85, b.zoom))
            : fallbackFocal.zoom,
      };

      return {
        index: idx,
        startSec,
        endSec,
        text: beatText,
        transition,
        action,
        cameraOverrideId:
          typeof b.cameraPresetId === 'string' && b.cameraPresetId.trim()
            ? b.cameraPresetId.trim()
            : detectCameraFromPrompt(beatText),
        imageIndices: beatImageIndices,
        focalRegion,
        lightingTint:
          typeof b.lightingTint === 'string' && /^#[0-9a-f]{3,8}$/i.test(b.lightingTint.trim())
            ? b.lightingTint.trim()
            : null,
        vfx: mergedVfx,
        speedMultiplier:
          typeof b.speedMultiplier === 'number' && Number.isFinite(b.speedMultiplier)
            ? Math.max(0.5, Math.min(2.0, b.speedMultiplier))
            : detectBeatSpeed(beatText),
      };
    });
  }

  return {
    durationSec,
    width,
    height,
    speedMultiplier,
    cameraOverrideId,
    vfx,
    accentColor,
    secondaryColor,
    audioEnabled,
    audioProfile,
    directorModel: aiPlan?.directorModel || null,
    beats,
  };
}
