import {
  parsePromptChoreography,
  type AiDirectorPlan,
  type AudioProfileType,
  type BeatActionType,
  type ParsedPromptChoreography,
  type PromptVfxFlags,
} from './promptSceneParser';
import { STYLE_PRESETS, type Wan3GenerationInput } from './wan3';

export interface LocalVideoRenderResult {
  videoUrl: string;
  choreography: ParsedPromptChoreography;
  hasAudioTrack: boolean;
}

export interface LocalVideoRenderOptions {
  input: Wan3GenerationInput;
  aiPlan?: AiDirectorPlan | null;
  onProgress?: (pct: number, elapsedSec: number, totalSec: number) => void;
  signal?: AbortSignal;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load reference frame for video encoding.'));
    img.src = src;
  });
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number
) {
  const imgRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
  const canvasRatio = canvasWidth / Math.max(1, canvasHeight);
  let drawW = canvasWidth;
  let drawH = canvasHeight;
  if (imgRatio > canvasRatio) {
    drawH = canvasHeight;
    drawW = canvasHeight * imgRatio;
  } else {
    drawW = canvasWidth;
    drawH = canvasWidth / imgRatio;
  }
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
}

function getCameraTransform(cameraPresetId: string, progress: number, speedMultiplier: number) {
  const p = Math.min(1, progress * (0.75 + 0.25 * speedMultiplier));
  const ease = 0.5 - 0.5 * Math.cos(Math.PI * p);
  const wave = Math.sin(p * Math.PI * 2);

  switch (cameraPresetId) {
    case 'dolly-in':
      return { scale: 1.04 + 0.14 * ease, tx: 0, ty: 0, rot: 0 };
    case 'dolly-out':
      return { scale: 1.18 - 0.14 * ease, tx: 0, ty: 0, rot: 0 };
    case 'dolly-left':
      return { scale: 1.12, tx: 0.045 * (0.5 - ease), ty: 0, rot: 0 };
    case 'dolly-right':
      return { scale: 1.12, tx: -0.045 * (0.5 - ease), ty: 0, rot: 0 };
    case 'crane-up':
      return { scale: 1.12, tx: 0, ty: 0.045 * (0.5 - ease), rot: 0 };
    case 'crane-down':
      return { scale: 1.12, tx: 0, ty: -0.045 * (0.5 - ease), rot: 0 };
    case '360-orbit':
    case 'arc':
    case 'bullet-time':
      return {
        scale: 1.1 + 0.04 * Math.sin(p * Math.PI),
        tx: 0.04 * wave,
        ty: -0.015 * Math.cos(p * Math.PI * 2),
        rot: 0.025 * wave,
      };
    case 'crash-zoom-in': {
      const punch = Math.pow(p, 0.35);
      return { scale: 1.04 + 0.26 * punch, tx: 0, ty: 0, rot: 0 };
    }
    case 'handheld':
      return {
        scale: 1.08 + 0.012 * Math.sin(p * Math.PI * 4),
        tx: 0.012 * Math.sin(p * Math.PI * 7),
        ty: 0.012 * Math.cos(p * Math.PI * 5),
        rot: 0.014 * Math.sin(p * Math.PI * 3),
      };
    case 'fpv-drone':
      return {
        scale: 1.14 + 0.06 * ease,
        tx: 0.035 * Math.sin(p * Math.PI * 3),
        ty: 0.02 * Math.cos(p * Math.PI * 2),
        rot: 0.045 * Math.sin(p * Math.PI * 2),
      };
    case 'dutch-angle':
      return { scale: 1.15 + 0.05 * ease, tx: 0, ty: 0, rot: -0.085 };
    default:
      return { scale: 1.05, tx: 0, ty: 0, rot: 0 };
  }
}

function getActionTransform(
  action: BeatActionType,
  beatProgress: number,
  elapsedSec: number,
  speedMultiplier: number
) {
  const ease = 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, beatProgress)));
  const t = elapsedSec * speedMultiplier;

  switch (action) {
    case 'walk-left':
      return {
        scaleBoost: 0.07,
        tx: 0.055 * (0.5 - ease),
        ty: Math.abs(Math.sin(t * 7.2)) * -0.012,
        rot: Math.sin(t * 3.6) * 0.012,
      };
    case 'walk-right':
      return {
        scaleBoost: 0.07,
        tx: -0.055 * (0.5 - ease),
        ty: Math.abs(Math.sin(t * 7.2)) * -0.012,
        rot: Math.sin(t * 3.6) * -0.012,
      };
    case 'sprint':
      return {
        scaleBoost: 0.12 + 0.04 * ease,
        tx: -0.07 * (0.5 - ease) + Math.sin(t * 14) * 0.006,
        ty: Math.abs(Math.sin(t * 13)) * -0.018,
        rot: Math.sin(t * 11) * 0.018,
      };
    case 'approach':
      return {
        scaleBoost: 0.04 + 0.16 * ease,
        tx: 0,
        ty: Math.abs(Math.sin(t * 5.2)) * -0.008,
        rot: 0,
      };
    case 'retreat':
      return {
        scaleBoost: 0.16 - 0.14 * ease,
        tx: 0,
        ty: Math.abs(Math.sin(t * 4.8)) * -0.006,
        rot: 0,
      };
    case 'turn-left':
      return {
        scaleBoost: 0.08 + 0.03 * Math.sin(beatProgress * Math.PI),
        tx: 0.045 * ease,
        ty: 0,
        rot: -0.035 * Math.sin(beatProgress * Math.PI),
      };
    case 'turn-right':
      return {
        scaleBoost: 0.08 + 0.03 * Math.sin(beatProgress * Math.PI),
        tx: -0.045 * ease,
        ty: 0,
        rot: 0.035 * Math.sin(beatProgress * Math.PI),
      };
    case 'rise':
      return {
        scaleBoost: 0.08,
        tx: 0,
        ty: 0.055 * (0.5 - ease),
        rot: 0,
      };
    case 'fall':
      return {
        scaleBoost: 0.08,
        tx: 0,
        ty: -0.055 * (0.5 - ease),
        rot: 0.018 * Math.sin(beatProgress * Math.PI),
      };
    case 'orbit':
      return {
        scaleBoost: 0.1,
        tx: 0.045 * Math.sin(beatProgress * Math.PI * 2),
        ty: -0.02 * Math.cos(beatProgress * Math.PI * 2),
        rot: 0.03 * Math.sin(beatProgress * Math.PI * 2),
      };
    case 'shake':
      return {
        scaleBoost: 0.08,
        tx: Math.sin(t * 36) * 0.016 * (1 - beatProgress * 0.5),
        ty: Math.cos(t * 31) * 0.016 * (1 - beatProgress * 0.5),
        rot: Math.sin(t * 27) * 0.022 * (1 - beatProgress * 0.5),
      };
    case 'idle':
    default:
      return {
        scaleBoost: 0.008 * Math.sin(t * 2.1),
        tx: 0,
        ty: 0.003 * Math.cos(t * 1.8),
        rot: 0,
      };
  }
}

function getStyleFilter(stylePresetId: string): string {
  switch (stylePresetId) {
    case 'noir':
      return 'grayscale(100%) contrast(1.28)';
    case 'warm-nostalgia':
      return 'sepia(24%) saturate(1.14) brightness(1.03)';
    case 'cold-thriller':
      return 'saturate(0.72) contrast(1.14) hue-rotate(10deg)';
    case 'vhs':
      return 'contrast(1.1) saturate(1.2) brightness(0.96)';
    case 'super-8mm':
      return 'sepia(20%) contrast(1.12) saturate(1.16)';
    case 'cinematic':
    case 'anamorphic':
      return 'contrast(1.08) saturate(1.06)';
    default:
      return 'none';
  }
}

function drawPromptAtmosphere(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeSec: number,
  vfx: PromptVfxFlags,
  accentColor: string,
  secondaryColor: string,
  speedMultiplier: number,
  styleId: string,
  isSprint: boolean
) {
  const t = timeSec * speedMultiplier;

  if (vfx.mist) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const cx = ((t * (28 + i * 11) + i * 310) % (width + 400)) - 200;
      const cy = height * (0.62 + (i % 2) * 0.14);
      const rad = width * 0.32;
      const g = ctx.createRadialGradient(cx, cy, 10, cx, cy, rad);
      g.addColorStop(0, 'rgba(215, 226, 240, 0.16)');
      g.addColorStop(1, 'rgba(215, 226, 240, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.restore();
  }

  if (vfx.sunbeams) {
    ctx.save();
    const sweep = Math.sin(t * 0.7) * width * 0.08;
    const beam = ctx.createLinearGradient(width * 0.15 + sweep, 0, width * 0.65 + sweep, height);
    beam.addColorStop(0, 'rgba(255, 220, 150, 0.20)');
    beam.addColorStop(0.5, 'rgba(255, 210, 130, 0.08)');
    beam.addColorStop(1, 'rgba(255, 210, 130, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(width * 0.05 + sweep, 0);
    ctx.lineTo(width * 0.42 + sweep, 0);
    ctx.lineTo(width * 0.85 + sweep, height);
    ctx.lineTo(width * 0.35 + sweep, height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  if (vfx.neonGlow || styleId === 'anamorphic') {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const xShift = width * (0.5 + 0.3 * Math.sin(t * 0.9));
    const glow = ctx.createRadialGradient(xShift, height * 0.45, 10, xShift, height * 0.45, width * 0.45);
    glow.addColorStop(0, `${accentColor}44`);
    glow.addColorStop(0.5, `${secondaryColor}22`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  if (vfx.rain) {
    ctx.save();
    ctx.strokeStyle = 'rgba(205, 225, 255, 0.42)';
    ctx.lineWidth = Math.max(1, width / 900);
    const dropCount = 95;
    for (let i = 0; i < dropCount; i++) {
      const seed = (i * 7919) % 1000;
      const x = ((seed / 1000) * width + t * 140) % width;
      const y = ((i * 53 + t * 880) % (height + 80)) - 40;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 6, y + height * 0.045);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (vfx.snow) {
    ctx.save();
    ctx.fillStyle = 'rgba(240, 246, 255, 0.72)';
    for (let i = 0; i < 65; i++) {
      const x = ((i * 97 + Math.sin(t * 1.4 + i) * 35) % width + width) % width;
      const y = ((i * 41 + t * (75 + (i % 5) * 14)) % (height + 20)) - 10;
      const r = 1.5 + (i % 3) * 1.1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (vfx.dustMotes) {
    ctx.save();
    for (let i = 0; i < 38; i++) {
      const x = ((i * 113 + Math.sin(t * 0.8 + i) * 28) % width + width) % width;
      const y = ((i * 67 + Math.cos(t * 0.6 + i) * 24) % height + height) % height;
      const alpha = 0.25 + 0.3 * Math.sin(t * 2 + i);
      ctx.fillStyle = `rgba(255, 236, 195, ${Math.max(0.08, alpha).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.4 + (i % 3) * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (vfx.embers) {
    ctx.save();
    for (let i = 0; i < 42; i++) {
      const x = ((i * 89 + Math.sin(t * 2.2 + i) * 32) % width + width) % width;
      const y = height - ((i * 47 + t * (110 + (i % 4) * 22)) % (height + 30));
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255, 165, 55, 0.82)' : 'rgba(255, 95, 35, 0.72)';
      ctx.beginPath();
      ctx.arc(x, y, 1.5 + (i % 3) * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  if (vfx.lightning) {
    const pulse = Math.sin(t * 7.5) * Math.sin(t * 2.1);
    if (pulse > 0.88) {
      ctx.save();
      ctx.fillStyle = 'rgba(225, 238, 255, 0.28)';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  if (isSprint) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = Math.max(1, width / 800);
    for (let i = 0; i < 16; i++) {
      const y = ((i * 61 + t * 30) % height);
      const xStart = ((i * 197 - t * 1400) % (width + 200) + width + 200) % (width + 200) - 200;
      ctx.beginPath();
      ctx.moveTo(xStart, y);
      ctx.lineTo(xStart + width * 0.14, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (styleId === 'vhs') {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    for (let y = 0; y < height; y += 4) {
      ctx.fillRect(0, y, width, 1);
    }
    ctx.restore();
  }

  if (styleId === 'anamorphic') {
    const barH = Math.round(height * 0.085);
    ctx.save();
    ctx.fillStyle = '#050608';
    ctx.fillRect(0, 0, width, barH);
    ctx.fillRect(0, height - barH, width, barH);
    ctx.restore();
  }
}

function startProceduralAudioTrack(profile: AudioProfileType): {
  track: MediaStreamTrack | null;
  stop: () => void;
} {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return { track: null, stop: () => {} };

    const audioCtx = new AudioCtx();
    const dest = audioCtx.createMediaStreamDestination();
    const masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.22;
    masterGain.connect(dest);

    const nodesToStop: Array<{ stop?: () => void; disconnect: () => void }> = [];

    if (profile === 'rain' || profile === 'wind' || profile === 'fire') {
      const bufferSize = audioCtx.sampleRate * 2;
      const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      let lastOut = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        output[i] = (lastOut + 0.04 * white) / 1.04;
        lastOut = output[i];
      }
      const noise = audioCtx.createBufferSource();
      noise.buffer = noiseBuffer;
      noise.loop = true;

      const filter = audioCtx.createBiquadFilter();
      filter.type = profile === 'rain' ? 'bandpass' : 'lowpass';
      filter.frequency.value = profile === 'rain' ? 1400 : profile === 'fire' ? 750 : 420;
      filter.Q.value = profile === 'rain' ? 0.6 : 1.2;

      noise.connect(filter);
      filter.connect(masterGain);
      noise.start();
      nodesToStop.push(noise, filter);
    } else if (profile === 'engine') {
      const osc = audioCtx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 58;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 175;
      osc.connect(filter);
      filter.connect(masterGain);
      osc.start();
      nodesToStop.push(osc, filter);
    } else {
      const osc1 = audioCtx.createOscillator();
      const osc2 = audioCtx.createOscillator();
      osc1.type = 'sine';
      osc2.type = 'triangle';
      osc1.frequency.value = profile === 'melodic' ? 196 : 110;
      osc2.frequency.value = profile === 'melodic' ? 293.66 : 164.81;
      const subGain = audioCtx.createGain();
      subGain.gain.value = 0.25;
      osc1.connect(subGain);
      osc2.connect(subGain);
      subGain.connect(masterGain);
      osc1.start();
      osc2.start();
      nodesToStop.push(osc1, osc2, subGain);
    }

    if (audioCtx.state === 'suspended') {
      void audioCtx.resume().catch(() => {});
    }

    const track = dest.stream.getAudioTracks()[0] || null;
    return {
      track,
      stop: () => {
        nodesToStop.forEach((n) => {
          try {
            n.stop?.();
            n.disconnect();
          } catch {
            // ignore cleanup errors
          }
        });
        void audioCtx.close().catch(() => {});
      },
    };
  } catch {
    return { track: null, stop: () => {} };
  }
}

export async function renderLocalMotionVideo(
  options: LocalVideoRenderOptions
): Promise<LocalVideoRenderResult> {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    throw new Error('Browser MediaRecorder is unavailable in this environment.');
  }

  const { input, aiPlan, onProgress, signal } = options;

  const imageUrls: string[] = [];
  if (input.mediaMode === 'frames') {
    if (input.startImage?.dataUrl) imageUrls.push(input.startImage.dataUrl);
    if (input.endImage?.dataUrl) imageUrls.push(input.endImage.dataUrl);
  } else if (input.referenceImages && input.referenceImages.length > 0) {
    input.referenceImages.forEach((r) => {
      if (r.dataUrl) imageUrls.push(r.dataUrl);
    });
  }

  const loadedImages = await Promise.all(imageUrls.map((url) => loadImage(url)));
  const firstImg = loadedImages[0] || null;
  const imageAspect =
    firstImg && firstImg.naturalWidth > 0 && firstImg.naturalHeight > 0
      ? firstImg.naturalWidth / firstImg.naturalHeight
      : null;

  const choreography = parsePromptChoreography(input, imageAspect, aiPlan);
  const { width, height, durationSec, beats } = choreography;
  const defaultCameraId = choreography.cameraOverrideId || input.cameraPresetId;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize 2D canvas context.');
  }

  const audioSession = choreography.audioEnabled
    ? startProceduralAudioTrack(choreography.audioProfile)
    : { track: null, stop: () => {} };

  const videoStream = canvas.captureStream(24);
  const combinedStream = new MediaStream(videoStream.getVideoTracks());
  if (audioSession.track) {
    combinedStream.addTrack(audioSession.track);
  }

  const mimeCandidates = audioSession.track
    ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm']
    : ['video/webm;codecs=vp8', 'video/webm', 'video/webm;codecs=vp9'];
  const mimeType = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';

  const bitrate = input.resolution === '1080p' ? 4_200_000 : input.resolution === '480p' ? 1_400_000 : 2_600_000;
  const recorder = mimeType
    ? new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: bitrate })
    : new MediaRecorder(combinedStream);

  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const totalMs = Math.round(durationSec * 1000);
  const styleFilter = getStyleFilter(input.stylePresetId);
  const styleMeta = STYLE_PRESETS.find((s) => s.id === input.stylePresetId);
  const suppressCaptions = /\b(text|caption|subtitles?|watermark)\b/i.test(input.negativePrompt || '');

  const drawStyledImageWithTransform = (
    img: HTMLImageElement,
    txPx: number,
    tyPx: number,
    rot: number,
    scale: number,
    alpha = 1
  ) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(width / 2 + txPx, height / 2 + tyPx);
    ctx.rotate(rot);
    ctx.scale(scale, scale);
    drawImageCover(ctx, img, width, height);
    ctx.restore();
  };

  const drawFrame = (_progress: number, elapsedSec: number) => {
    ctx.save();
    ctx.fillStyle = '#0B0D10';
    ctx.fillRect(0, 0, width, height);

    const activeBeatIdx = Math.max(
      0,
      beats.findIndex((b) => elapsedSec >= b.startSec && elapsedSec <= b.endSec)
    );
    const activeBeat = beats[activeBeatIdx] || beats[beats.length - 1];
    const prevBeat = activeBeatIdx > 0 ? beats[activeBeatIdx - 1] : null;

    const beatSpan = Math.max(0.25, activeBeat.endSec - activeBeat.startSec);
    const beatElapsed = Math.max(0, elapsedSec - activeBeat.startSec);
    const beatProgress = Math.min(1, beatElapsed / beatSpan);

    const beatCamera = activeBeat.cameraOverrideId || defaultCameraId;
    const cam = getCameraTransform(beatCamera, beatProgress, activeBeat.speedMultiplier);
    const act = getActionTransform(
      activeBeat.action,
      beatProgress,
      elapsedSec,
      activeBeat.speedMultiplier
    );

    const focal = activeBeat.focalRegion || { x: 0.5, y: 0.48, zoom: 1 };
    const focalEase = 0.5 - 0.5 * Math.cos(Math.PI * beatProgress);
    const focalZoomBoost = (focal.zoom - 1) * (0.35 + 0.65 * focalEase);
    const focalOffsetX = (0.5 - focal.x) * (focal.zoom - 0.9) * 0.48;
    const focalOffsetY = (0.5 - focal.y) * (focal.zoom - 0.9) * 0.48;

    const txPx = (cam.tx + act.tx + focalOffsetX) * width;
    const tyPx = (cam.ty + act.ty + focalOffsetY) * height;
    const rot = cam.rot + act.rot;
    const scale = cam.scale + act.scaleBoost + focalZoomBoost;

    ctx.filter = styleFilter;

    // Select ONLY the reference images targeted by this beat's script
    const beatImages = activeBeat.imageIndices
      .map((idx) => loadedImages[idx])
      .filter((img): img is HTMLImageElement => Boolean(img));

    if (beatImages.length === 1) {
      const targetImg = beatImages[0];
      const transitionDuration = 0.35;
      const inTransition =
        prevBeat && beatElapsed < transitionDuration && activeBeat.transition !== 'cut';

      if (inTransition && prevBeat) {
        const prevIdx = prevBeat.imageIndices[prevBeat.imageIndices.length - 1] ?? 0;
        const prevImg = loadedImages[prevIdx] || targetImg;
        const tFrac = beatElapsed / transitionDuration;

        if (activeBeat.transition === 'wipe-left' || activeBeat.transition === 'wipe-right') {
          drawStyledImageWithTransform(prevImg, txPx, tyPx, rot, scale, 1);
          ctx.save();
          ctx.beginPath();
          if (activeBeat.transition === 'wipe-right') {
            ctx.rect(0, 0, width * tFrac, height);
          } else {
            ctx.rect(width * (1 - tFrac), 0, width * tFrac, height);
          }
          ctx.clip();
          drawStyledImageWithTransform(targetImg, txPx, tyPx, rot, scale, 1);
          ctx.restore();
        } else if (activeBeat.transition === 'dissolve') {
          drawStyledImageWithTransform(prevImg, txPx, tyPx, rot, scale, 1);
          drawStyledImageWithTransform(targetImg, txPx, tyPx, rot, scale, tFrac);
        } else {
          drawStyledImageWithTransform(targetImg, txPx, tyPx, rot, scale, 1);
        }
      } else {
        drawStyledImageWithTransform(targetImg, txPx, tyPx, rot, scale, 1);
      }

      if (activeBeat.transition === 'flash' && beatElapsed < 0.22) {
        ctx.save();
        ctx.filter = 'none';
        ctx.fillStyle = `rgba(255, 255, 255, ${(1 - beatElapsed / 0.22) * 0.65})`;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    } else if (beatImages.length > 1) {
      // Only morph across the subset of images explicitly referenced inside THIS beat
      const scaledIdx = beatProgress * (beatImages.length - 1);
      const idxA = Math.min(beatImages.length - 1, Math.floor(scaledIdx));
      const idxB = Math.min(beatImages.length - 1, idxA + 1);
      const blend = scaledIdx - idxA;

      drawStyledImageWithTransform(beatImages[idxA], txPx, tyPx, rot, scale, 1);
      if (idxB !== idxA && blend > 0) {
        drawStyledImageWithTransform(beatImages[idxB], txPx, tyPx, rot, scale, Math.min(1, blend));
      }
    } else {
      // Text-to-video script stage driven by active beat & motion
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#0E1218');
      grad.addColorStop(0.5 + 0.15 * Math.sin(beatProgress * Math.PI * 2), `${choreography.accentColor}26`);
      grad.addColorStop(1, '#090B0E');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      ctx.filter = 'none';
      ctx.fillStyle = choreography.accentColor;
      ctx.font = `600 ${Math.max(12, Math.round(height * 0.024))}px monospace`;
      ctx.fillText(
        `${(input.remoteModelId?.trim() || input.modelId).toUpperCase()} · ${activeBeat.action.toUpperCase()} · ${styleMeta?.name || 'Cinematic'}`,
        width * 0.06,
        height * 0.14
      );

      const textToShow = activeBeat?.text || input.prompt;
      ctx.fillStyle = '#F2F4F8';
      const fontSize = Math.max(16, Math.round(height * 0.036));
      ctx.font = `500 ${fontSize}px sans-serif`;
      const words = textToShow.trim().split(/\s+/).slice(0, 26);
      const lines: string[] = [];
      let line = '';
      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        if (ctx.measureText(testLine).width > width * 0.86) {
          lines.push(line);
          line = word;
        } else {
          line = testLine;
        }
      }
      if (line) lines.push(line);
      lines.slice(0, 5).forEach((ln, idx) => {
        ctx.fillText(
          ln,
          width * 0.06 + txPx * 0.25,
          height * 0.25 + idx * fontSize * 1.45 + tyPx * 0.25
        );
      });
    }

    ctx.filter = 'none';
    if (activeBeat.lightingTint) {
      ctx.save();
      ctx.globalCompositeOperation = 'soft-light';
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = activeBeat.lightingTint;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    drawPromptAtmosphere(
      ctx,
      width,
      height,
      elapsedSec,
      activeBeat.vfx,
      choreography.accentColor,
      choreography.secondaryColor,
      activeBeat.speedMultiplier,
      input.stylePresetId,
      activeBeat.action === 'sprint'
    );

    if (!/\b(vignette|dark edges)\b/i.test(input.negativePrompt || '')) {
      const vig = ctx.createRadialGradient(
        width / 2,
        height / 2,
        width * 0.28,
        width / 2,
        height / 2,
        width * 0.74
      );
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.34)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, width, height);
    }

    if (!suppressCaptions && beats.length > 1 && activeBeat?.text) {
      ctx.fillStyle = 'rgba(8, 10, 13, 0.72)';
      ctx.fillRect(0, height - Math.round(height * 0.095), width, Math.round(height * 0.095));
      ctx.fillStyle = '#E5A93C';
      ctx.font = `600 ${Math.max(10, Math.round(height * 0.019))}px monospace`;
      ctx.fillText(
        `SHOT ${activeBeat.index + 1} [${activeBeat.action}]`,
        width * 0.04,
        height - Math.round(height * 0.056)
      );
      ctx.fillStyle = '#F2F4F8';
      ctx.font = `500 ${Math.max(11, Math.round(height * 0.022))}px sans-serif`;
      ctx.fillText(
        activeBeat.text.slice(0, 96),
        width * 0.04,
        height - Math.round(height * 0.024)
      );
    }

    ctx.restore();
  };

  return new Promise<LocalVideoRenderResult>((resolve, reject) => {
    let finished = false;
    let aborted = false;
    let rafId = 0;

    const cleanup = () => {
      combinedStream.getTracks().forEach((t) => t.stop());
      videoStream.getTracks().forEach((t) => t.stop());
      audioSession.stop();
    };

    const onAbort = () => {
      aborted = true;
      finished = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      try {
        if (recorder.state !== 'inactive') recorder.stop();
      } catch {
        // ignore
      }
      cleanup();
      reject(new Error('Video rendering cancelled.'));
    };

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    recorder.onerror = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      cleanup();
      reject(new Error('Video encoder failed to record frames.'));
    };

    recorder.onstop = () => {
      signal?.removeEventListener('abort', onAbort);
      cleanup();
      if (aborted) return;
      try {
        const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
        if (blob.size === 0) {
          reject(new Error('Recorded video was empty.'));
          return;
        }
        resolve({
          videoUrl: URL.createObjectURL(blob),
          choreography,
          hasAudioTrack: Boolean(audioSession.track),
        });
      } catch (err) {
        reject(err);
      }
    };

    drawFrame(0, 0);
    recorder.start(150);

    const startedAt = performance.now();
    const tick = () => {
      if (finished || aborted) return;
      const elapsedMs = performance.now() - startedAt;
      const elapsedSec = Math.min(durationSec, elapsedMs / 1000);
      const progress = Math.min(1, elapsedMs / totalMs);
      drawFrame(progress, elapsedSec);
      onProgress?.(Math.round(progress * 100), elapsedSec, durationSec);

      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      } else {
        finished = true;
        window.setTimeout(() => {
          if (aborted) return;
          try {
            if (recorder.state === 'recording') {
              recorder.requestData();
              recorder.stop();
            } else if (recorder.state !== 'inactive') {
              recorder.stop();
            }
          } catch (err) {
            cleanup();
            reject(err);
          }
        }, 160);
      }
    };

    rafId = window.requestAnimationFrame(tick);
  });
}
