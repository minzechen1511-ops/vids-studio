import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWan3CompiledJob,
  compileWan3Prompt,
  normalizeParamsForModel,
  validateWan3Payload,
  type Wan3GenerationInput,
} from './wan3.ts';
import { parsePromptChoreography, resolveOutputDimensions } from './promptSceneParser.ts';
import {
  buildProviderRequestPayload,
  detectWanProvider,
  extractVideoAndTask,
  resolveEffectiveVideoEndpoint,
  resolveVideoSecretKey,
  validateAllowedHttpsEndpoint,
} from './providerAdapters.ts';

function baseInput(overrides: Partial<Wan3GenerationInput> = {}): Wan3GenerationInput {
  return {
    modelId: 'wan3_0',
    prompt: 'A dancer spins under warm tungsten studio lights, silk fabric flowing.',
    duration: 5,
    resolution: '720p',
    aspectRatio: '16:9',
    generateAudio: true,
    enableThinking: false,
    singleShot: true,
    cameraPresetId: 'dolly-in',
    stylePresetId: 'cinematic',
    mediaMode: 'frames',
    startImage: {
      id: 'img-1',
      name: 'frame1.jpg',
      dataUrl: 'data:image/jpeg;base64,abc',
      role: 'start_image',
    },
    endImage: null,
    referenceImages: [],
    ...overrides,
  };
}

test('validateWan3Payload passes valid frames configuration', () => {
  const result = validateWan3Payload(baseInput());
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('validateWan3Payload rejects end_image without start_image', () => {
  const result = validateWan3Payload(
    baseInput({
      startImage: null,
      endImage: {
        id: 'img-2',
        name: 'end.jpg',
        dataUrl: 'data:image/jpeg;base64,xyz',
        role: 'end_image',
      },
    })
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('end_image requires start_image')));
});

test('validateWan3Payload enforces mutual exclusion between frames and referenceImages', () => {
  const result = validateWan3Payload(
    baseInput({
      mediaMode: 'frames',
      referenceImages: [
        {
          id: 'ref-1',
          name: 'ref.jpg',
          dataUrl: 'data:image/jpeg;base64,ref',
          role: 'image_references',
        },
      ],
    })
  );
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('cannot be combined')));
});

test('validateWan3Payload accepts smart duration -1 with billing warning on wan3_0', () => {
  const result = validateWan3Payload(baseInput({ duration: -1 }));
  assert.equal(result.valid, true);
  assert.ok(result.warnings.some((w) => w.includes('10s')));
});

test('validateWan3Payload rejects out-of-range duration like 1 or 35', () => {
  assert.equal(validateWan3Payload(baseInput({ duration: 1 })).valid, false);
  assert.equal(validateWan3Payload(baseInput({ duration: 35 })).valid, false);
  assert.equal(validateWan3Payload(baseInput({ duration: 2.5 })).valid, false);
});

test('compileWan3Prompt preserves user creative prompt verbatim without censorship', () => {
  const rawUserPrompt = 'Two lovers embrace intimately by candlelight, silk sheets shifting slowly.';
  const compiled = compileWan3Prompt(
    baseInput({
      prompt: rawUserPrompt,
      negativePrompt: 'warped hands, flicker',
      audioCue: 'soft breathing and rain outside the window',
    })
  );
  assert.ok(compiled.includes(rawUserPrompt));
  assert.ok(compiled.includes('Generate single shot.'));
  assert.ok(compiled.includes('Starting from Image 1 as the opening frame.'));
  assert.ok(compiled.includes('Camera: Camera Dolly In smoothly toward the subject.'));
  assert.ok(compiled.includes('Audio: soft breathing and rain outside the window'));
  assert.ok(compiled.includes('Negative prompt: warped hands, flicker'));
});

test('compileWan3Prompt numbers multiple reference images in reference mode', () => {
  const compiled = compileWan3Prompt(
    baseInput({
      mediaMode: 'references',
      startImage: null,
      referenceImages: [
        { id: 'r1', name: 'hero.png', dataUrl: 'data:image/png;base64,1', role: 'image_references' },
        { id: 'r2', name: 'room.png', dataUrl: 'data:image/png;base64,2', role: 'image_references' },
      ],
    })
  );
  assert.ok(compiled.includes('Image 1 (hero.png), Image 2 (room.png)'));
});

test('buildWan3CompiledJob generates valid wan3_0_prime CLI command', () => {
  const job = buildWan3CompiledJob(
    baseInput({
      modelId: 'wan3_0_prime',
      resolution: '1080p',
      enableThinking: true,
    })
  );
  assert.equal(job.model, 'wan3_0_prime');
  assert.equal(job.parameters.resolution, '1080p');
  assert.equal(job.parameters.enable_thinking, true);
  assert.ok(job.cliCommand.includes('--model wan3_0_prime'));
  assert.ok(job.cliCommand.includes('--param resolution=1080p'));
  assert.ok(job.cliCommand.includes('--media start_image="frame1.jpg"'));
});

test('compileWan3Prompt avoids duplicating headers when prompt already contains Wan 3.0 markers', () => {
  const enhanced =
    'Generate single shot.\n\nAnimate from Image 1.\n\nShot 1 [0-5s]: Rider turns head. Camera Dolly In smoothly toward the subject.\n\nLook: Natural look.';
  const compiled = compileWan3Prompt(baseInput({ prompt: enhanced }));
  const singleShotMatches = compiled.match(/Generate single shot/gi) || [];
  assert.equal(singleShotMatches.length, 1);
  const cameraMatches = compiled.match(/Camera Dolly In smoothly toward the subject/gi) || [];
  assert.equal(cameraMatches.length, 1);
});

test('wan2_6 open-weight schema validates discrete durations, quality param, and reference mode', () => {
  const validWan26 = validateWan3Payload(
    baseInput({
      modelId: 'wan2_6',
      mediaMode: 'references',
      startImage: null,
      endImage: null,
      referenceImages: [
        { id: 'r1', name: 'hero.jpg', dataUrl: 'data:image/jpeg;base64,abc', role: 'image_references' },
      ],
      duration: 10,
      resolution: '1080p',
      aspectRatio: '16:9',
    })
  );
  assert.equal(validWan26.valid, true);

  // wan2_6 rejects 7s (discrete [5, 10, 15]), 480p, or frames mode
  assert.equal(
    validateWan3Payload(
      baseInput({
        modelId: 'wan2_6',
        mediaMode: 'references',
        startImage: null,
        duration: 7,
      })
    ).valid,
    false
  );
  assert.equal(
    validateWan3Payload(
      baseInput({
        modelId: 'wan2_6',
        mediaMode: 'references',
        startImage: null,
        resolution: '480p',
      })
    ).valid,
    false
  );

  const job26 = buildWan3CompiledJob(
    baseInput({
      modelId: 'wan2_6',
      mediaMode: 'references',
      startImage: null,
      referenceImages: [
        { id: 'r1', name: 'hero.jpg', dataUrl: 'data:image/jpeg;base64,abc', role: 'image_references' },
      ],
      duration: 15,
      resolution: '720p',
      aspectRatio: '9:16',
    })
  );
  assert.equal(job26.parameters.quality, '720p');
  assert.equal(job26.parameters.resolution, undefined);
  assert.ok(job26.cliCommand.includes('--param quality=720p'));
});

test('wan2_7 schema validates 2..15s range and start/end frame roles', () => {
  const valid27 = validateWan3Payload(
    baseInput({
      modelId: 'wan2_7',
      duration: 12,
      resolution: '1080p',
      aspectRatio: '4:3',
      mediaMode: 'frames',
    })
  );
  assert.equal(valid27.valid, true);
  assert.equal(
    validateWan3Payload(baseInput({ modelId: 'wan2_7', duration: 20 })).valid,
    false
  );
  assert.equal(
    validateWan3Payload(baseInput({ modelId: 'wan2_7', duration: -1 })).valid,
    false
  );
});

test('normalizeParamsForModel safely adapts incompatible settings when switching to wan2_6', () => {
  const normalized = normalizeParamsForModel('wan2_6', {
    duration: 24,
    resolution: '480p',
    aspectRatio: 'auto',
    mediaMode: 'frames',
  });
  assert.equal(normalized.duration, 15);
  assert.equal(normalized.resolution, '720p');
  assert.equal(normalized.aspectRatio, '16:9');
  assert.equal(normalized.mediaMode, 'references');
});

test('resolveOutputDimensions matches exact 480p/720p/1080p aspect ratios with even dimensions', () => {
  assert.deepEqual(resolveOutputDimensions('16:9', '1080p'), { width: 1920, height: 1080 });
  assert.deepEqual(resolveOutputDimensions('9:16', '720p'), { width: 720, height: 1280 });
  assert.deepEqual(resolveOutputDimensions('1:1', '480p'), { width: 480, height: 480 });
  assert.deepEqual(resolveOutputDimensions('4:3', '720p'), { width: 960, height: 720 });
});

test('parsePromptChoreography honors exact duration, VFX cues, negative prompt suppression, and multi-shot beats', () => {
  const parsed = parsePromptChoreography(
    baseInput({
      duration: 10,
      resolution: '1080p',
      aspectRatio: '9:16',
      singleShot: false,
      cameraPresetId: 'static',
      prompt:
        'Shot 1 [0-4s]: Neon rain falls across the street, orbit around subject.\nShot 2 [4-10s]: Slow-motion mist rises as embers drift.',
      negativePrompt: 'snow, embers',
      audioCue: 'Heavy rain and thunder',
    })
  );
  assert.equal(parsed.durationSec, 10);
  assert.equal(parsed.width, 1080);
  assert.equal(parsed.height, 1920);
  assert.equal(parsed.vfx.rain, true);
  assert.equal(parsed.vfx.neonGlow, true);
  assert.equal(parsed.vfx.mist, true);
  assert.equal(parsed.vfx.embers, false); // Suppressed by negativePrompt
  assert.equal(parsed.cameraOverrideId, '360-orbit');
  assert.equal(parsed.audioProfile, 'rain');
  assert.equal(parsed.beats.length, 2);
  assert.equal(parsed.beats[1].endSec, 10);
});

test('providerAdapters builds accurate DashScope and fal.ai payloads and extracts video/task IDs', () => {
  assert.equal(
    detectWanProvider('https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis'),
    'dashscope'
  );
  assert.equal(detectWanProvider('https://queue.fal.run/fal-ai/wan-2.6/image-to-video'), 'fal');

  const input = baseInput({
    modelId: 'wan2_6',
    mediaMode: 'references',
    startImage: null,
    referenceImages: [
      { id: 'r1', name: 'ref.jpg', dataUrl: 'data:image/jpeg;base64,abc', role: 'image_references' },
    ],
    duration: 15,
    resolution: '1080p',
    aspectRatio: '16:9',
    negativePrompt: 'blurry faces',
  });
  const job = buildWan3CompiledJob(input);
  const dash = buildProviderRequestPayload('dashscope', input, job);
  assert.equal(dash.body.model, 'wan2.6-r2v');
  assert.equal((dash.body.parameters as Record<string, unknown>).size, '1920*1080');
  assert.equal((dash.body.parameters as Record<string, unknown>).duration, 15);
  assert.equal((dash.body.input as Record<string, unknown>).negative_prompt, 'blurry faces');

  const extracted = extractVideoAndTask({
    output: { task_id: 'task_99', video_url: 'https://cdn.example.com/out.mp4' },
  });
  assert.equal(extracted.taskId, 'task_99');
  assert.equal(extracted.videoUrl, 'https://cdn.example.com/out.mp4');
});

test('custom video model mode validates remoteModelId and propagates it to compiled job and payloads', () => {
  const missingId = validateWan3Payload(baseInput({ modelId: 'custom', remoteModelId: '' }));
  assert.equal(missingId.valid, false);
  assert.ok(missingId.errors.some((e) => e.includes('Custom Video Model ID')));

  const customInput = baseInput({
    modelId: 'custom',
    remoteModelId: 'fal-ai/kling-video/v2/master/image-to-video',
    remoteEndpoint: 'https://queue.fal.run/fal-ai/kling-video/v2/master/image-to-video',
    remoteProvider: 'fal',
  });
  assert.equal(validateWan3Payload(customInput).valid, true);
  const job = buildWan3CompiledJob(customInput);
  assert.equal(job.model, 'fal-ai/kling-video/v2/master/image-to-video');
  assert.ok(job.cliCommand.includes('--model fal-ai/kling-video/v2/master/image-to-video'));

  const falPayload = buildProviderRequestPayload('fal', customInput, job);
  assert.equal(falPayload.body.model, 'fal-ai/kling-video/v2/master/image-to-video');
});

test('validateAllowedHttpsEndpoint blocks private/loopback/HTTP URLs and permits allowlisted providers', () => {
  assert.equal(
    validateAllowedHttpsEndpoint('https://queue.fal.run/fal-ai/wan-2.6/image-to-video', 'video').allowed,
    true
  );
  assert.equal(
    validateAllowedHttpsEndpoint('https://openrouter.ai/api/v1/chat/completions', 'llm').allowed,
    true
  );
  assert.equal(
    validateAllowedHttpsEndpoint('http://127.0.0.1:8188/prompt', 'video').allowed,
    false
  );
  assert.equal(
    validateAllowedHttpsEndpoint('https://169.254.169.254/latest/meta-data', 'video').allowed,
    false
  );
  assert.equal(
    validateAllowedHttpsEndpoint('https://10.0.0.5/api', 'llm').allowed,
    false
  );
});

import { parseFreeOpenRouterModels } from './openrouterModels.ts';

test('parseFreeOpenRouterModels filters to free chat models, detects vision, and excludes audio-only models', () => {
  const catalog = [
    {
      id: 'openai/gpt-4o',
      name: 'GPT-4o',
      context_length: 128000,
      architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
      pricing: { prompt: '0.0000025', completion: '0.00001' },
    },
    {
      id: 'google/lyria-3-pro-preview',
      name: 'Google: Lyria 3 Pro Preview',
      context_length: 1048576,
      architecture: { input_modalities: ['text', 'image'], output_modalities: ['text', 'audio'] },
      pricing: { prompt: '0', completion: '0' },
    },
    {
      id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
      name: 'NVIDIA: Nemotron 3 Ultra (free)',
      context_length: 1000000,
      architecture: { input_modalities: ['text'], output_modalities: ['text'] },
      pricing: { prompt: '0', completion: '0' },
    },
    {
      id: 'google/gemma-4-31b-it:free',
      name: 'Google: Gemma 4 31B (free)',
      context_length: 262144,
      architecture: { input_modalities: ['image', 'text'], output_modalities: ['text'] },
      pricing: { prompt: '0', completion: '0' },
    },
    {
      id: 'openrouter/free',
      name: 'Free Models Router',
      context_length: 200000,
      architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
      pricing: { prompt: '0', completion: '0' },
    },
  ];

  const models = parseFreeOpenRouterModels(catalog);
  assert.deepEqual(
    models.map((m) => m.id),
    [
      'openrouter/free',
      'google/gemma-4-31b-it:free',
      'nvidia/nemotron-3-ultra-550b-a55b:free',
    ]
  );
  assert.equal(models[0].vision, true);
  assert.equal(models[1].vision, true);
  assert.equal(models[1].label, 'Google: Gemma 4 31B [Vision]');
  assert.equal(models[2].vision, false);
});

test('parsePromptChoreography maps each beat to designated reference images, actions, and per-beat VFX', () => {
  const parsed = parsePromptChoreography(
    baseInput({
      mediaMode: 'references',
      startImage: null,
      singleShot: false,
      duration: 8,
      referenceImages: [
        { id: 'r1', name: 'hero_alley.jpg', dataUrl: 'data:image/jpeg;base64,1', role: 'image_references' },
        { id: 'r2', name: 'rooftop_chase.jpg', dataUrl: 'data:image/jpeg;base64,2', role: 'image_references' },
      ],
      prompt:
        'Shot 1 [0-4s]: Image 1 walks right through golden sunlight.\nShot 2 [4-8s]: Image 2 sprints under neon rain and lightning.',
    })
  );

  assert.equal(parsed.beats.length, 2);
  assert.deepEqual(parsed.beats[0].imageIndices, [0]);
  assert.equal(parsed.beats[0].action, 'walk-right');
  assert.equal(parsed.beats[0].vfx.sunbeams, true);
  assert.equal(parsed.beats[0].vfx.lightning, false);

  assert.deepEqual(parsed.beats[1].imageIndices, [1]);
  assert.equal(parsed.beats[1].action, 'sprint');
  assert.equal(parsed.beats[1].vfx.rain, true);
  assert.equal(parsed.beats[1].vfx.lightning, true);
  assert.equal(parsed.beats[1].vfx.sunbeams, false);
});

test('providerAdapters detects and allows router.huggingface.co endpoints', () => {
  const hfUrl = 'https://router.huggingface.co/hf-inference/models/Wan-AI/Wan2.1-T2V-14B';
  assert.equal(validateAllowedHttpsEndpoint(hfUrl, 'video').allowed, true);
  assert.equal(detectWanProvider(hfUrl), 'huggingface');

  const input = baseInput({
    modelId: 'custom',
    remoteModelId: 'Wan-AI/Wan2.1-T2V-14B',
    remoteEndpoint: hfUrl,
    remoteProvider: 'huggingface',
  });
  const job = buildWan3CompiledJob(input);
  const payload = buildProviderRequestPayload('huggingface', input, job);
  assert.equal(typeof payload.body.inputs, 'string');
  assert.ok((payload.body.inputs as string).includes(input.prompt));
});

test('resolveVideoSecretKey supports multi-provider secrets, explicit secretEnvName, and none', () => {
  const env = {
    HF_TOKEN: 'hf_test',
    FAL_KEY: 'fal_test',
    VIDEO_API_KEY: 'vid_test',
    WAN_API_KEY: 'wan_test',
  };

  assert.deepEqual(resolveVideoSecretKey('huggingface', 'auto', env), {
    apiKey: 'hf_test',
    secretUsed: 'HF_TOKEN',
  });
  assert.deepEqual(resolveVideoSecretKey('fal', 'auto', env), {
    apiKey: 'fal_test',
    secretUsed: 'FAL_KEY',
  });
  assert.deepEqual(resolveVideoSecretKey('huggingface', 'VIDEO_API_KEY', env), {
    apiKey: 'vid_test',
    secretUsed: 'VIDEO_API_KEY',
  });
  assert.deepEqual(resolveVideoSecretKey('fal', 'none', env), {
    apiKey: null,
    secretUsed: 'none',
  });
  // A generic endpoint must not receive an unrelated provider credential.
  assert.deepEqual(resolveVideoSecretKey('generic', 'auto', { HF_TOKEN: 'hf_only' }), {
    apiKey: null,
    secretUsed: null,
  });
});

test('resolveEffectiveVideoEndpoint derives endpoints from Saved Model ID and Provider when endpoint URL is blank', () => {
  assert.deepEqual(
    resolveEffectiveVideoEndpoint({
      remoteModelId: 'Wan-AI/Wan2.2-TI2V-5B',
      remoteProvider: 'huggingface',
      remoteEndpoint: '',
    }),
    {
      endpoint: 'https://router.huggingface.co/hf-inference/models/Wan-AI/Wan2.2-TI2V-5B',
      source: 'derived',
    }
  );
  assert.deepEqual(
    resolveEffectiveVideoEndpoint({
      remoteModelId: 'fal-ai/wan/v2.2-a14b/image-to-video',
      remoteProvider: 'auto',
      remoteEndpoint: '',
    }),
    {
      endpoint: 'https://queue.fal.run/fal-ai/wan/v2.2-a14b/image-to-video',
      source: 'derived',
    }
  );
  assert.deepEqual(
    resolveEffectiveVideoEndpoint({
      remoteModelId: 'wan-video/wan-2.2-i2v-fast',
      remoteProvider: 'replicate',
      remoteEndpoint: '',
    }),
    {
      endpoint: 'https://api.replicate.com/v1/models/wan-video/wan-2.2-i2v-fast/predictions',
      source: 'derived',
    }
  );
});

test('extractVideoAndTask captures fal response_url and Replicate payload omits version for owner/model slugs', () => {
  const falQueue = extractVideoAndTask({
    request_id: 'req_123',
    status_url: 'https://queue.fal.run/fal-ai/wan/requests/req_123/status',
    response_url: 'https://queue.fal.run/fal-ai/wan/requests/req_123',
  });
  assert.equal(falQueue.taskId, 'req_123');
  assert.equal(falQueue.responseUrl, 'https://queue.fal.run/fal-ai/wan/requests/req_123');

  const repInput = baseInput({
    modelId: 'custom',
    remoteModelId: 'wan-video/wan-2.2-i2v-fast',
    remoteProvider: 'replicate',
  });
  const repJob = buildWan3CompiledJob(repInput);
  const repPayload = buildProviderRequestPayload('replicate', repInput, repJob);
  assert.equal(repPayload.body.version, undefined);
  assert.equal(repPayload.body.model, 'wan-video/wan-2.2-i2v-fast');
});

test('parsePromptChoreography merges AI Director beats, focal regions, and lighting tints', () => {
  const parsed = parsePromptChoreography(
    baseInput({
      mediaMode: 'references',
      startImage: null,
      duration: 6,
      referenceImages: [
        { id: 'r1', name: 'subject.jpg', dataUrl: 'data:image/jpeg;base64,1', role: 'image_references' },
        { id: 'r2', name: 'street.jpg', dataUrl: 'data:image/jpeg;base64,2', role: 'image_references' },
      ],
    }),
    null,
    {
      directorModel: 'google/gemma-4-31b-it:free',
      accentColor: '#22D3EE',
      beats: [
        {
          startSec: 0,
          endSec: 3,
          text: 'Close-up on rider visor',
          imageIndices: [0],
          action: 'approach',
          transition: 'cut',
          focalX: 0.45,
          focalY: 0.3,
          zoom: 1.5,
          lightingTint: '#22D3EE',
          vfx: { rain: true },
        },
        {
          startSec: 3,
          endSec: 6,
          text: 'Sprints down wet alley',
          imageIndices: [1],
          action: 'sprint',
          transition: 'flash',
          focalX: 0.6,
          focalY: 0.55,
          zoom: 1.2,
          vfx: { lightning: true },
        },
      ],
    }
  );

  assert.equal(parsed.directorModel, 'google/gemma-4-31b-it:free');
  assert.equal(parsed.beats.length, 2);
  assert.deepEqual(parsed.beats[0].imageIndices, [0]);
  assert.equal(parsed.beats[0].action, 'approach');
  assert.equal(parsed.beats[0].focalRegion.y, 0.3);
  assert.equal(parsed.beats[0].focalRegion.zoom, 1.5);
  assert.equal(parsed.beats[0].lightingTint, '#22D3EE');
  assert.deepEqual(parsed.beats[1].imageIndices, [1]);
  assert.equal(parsed.beats[1].action, 'sprint');
  assert.equal(parsed.beats[1].transition, 'flash');
});

test('parsePromptChoreography recognizes continuous -ing action verbs across beats', () => {
  const parsed = parsePromptChoreography(
    baseInput({
      singleShot: false,
      duration: 8,
      prompt:
        'Shot 1 [0-2s]: Close-up on rider visor looking right.\nShot 2 [2-4s]: Character walking left down the corridor.\nShot 3 [4-6s]: Subject approaching the neon doorway.\nShot 4 [6-8s]: Camera orbiting as rain begins.',
    })
  );

  assert.equal(parsed.beats.length, 4);
  assert.equal(parsed.beats[0].action, 'turn-right');
  assert.equal(parsed.beats[1].action, 'walk-left');
  assert.equal(parsed.beats[2].action, 'approach');
  assert.equal(parsed.beats[3].action, 'orbit');
});
