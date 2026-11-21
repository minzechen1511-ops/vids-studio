import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildWan3CompiledJob,
  CAMERA_PRESETS,
  getEffectiveModelId,
  OPENROUTER_PRESET_MODELS,
  STYLE_PRESETS,
  validateWan3Payload,
  type RemoteProviderHint,
  type Wan3GenerationInput,
} from './src/lib/wan3.ts';
import {
  ALLOWED_VIDEO_SECRET_NAMES,
  buildProviderRequestPayload,
  detectWanProvider,
  extractVideoAndTask,
  getAvailableVideoSecretNames,
  resolveEffectiveVideoEndpoint,
  resolveVideoSecretKey,
  validateAllowedHttpsEndpoint,
  type WanProviderKind,
} from './src/lib/providerAdapters.ts';
import {
  DEFAULT_FREE_OPENROUTER_MODELS,
  parseFreeOpenRouterModels,
  type OpenRouterModelOption,
} from './src/lib/openrouterModels.ts';
import { FREE_LTX_MODEL, modelIdentifierError, selectGenerationRoute, validateVideoModelSettings } from './src/lib/modelRouting.ts';
import { loadModelCatalog, openRouterContentUrl, writeVideoScript } from './src/lib/openrouterVideo.ts';
import { getLtxTask, LTX_SPACE_URL, submitLtxVideo, validateLtxInput } from './src/lib/ltxSpace.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_REPO_DIR = path.resolve(__dirname, 'higgsfield-ai-prompt-skill');
const SAVED_MODELS_FILE = path.resolve(__dirname, '.mz-vids-saved-models.json');
const PORT = Number(process.env.PORT || 3000);

interface TrackedTask {
  pollUrl: string;
  responseUrl: string | null;
  provider: WanProviderKind;
  secretUsed: string | null;
  isLocalGpu: boolean;
  createdAt: number;
  completed?: boolean;
}

interface StoredVideoModelRecord {
  id: string;
  modelId: string;
  endpoint: string;
  provider: RemoteProviderHint;
  secretEnvName?: string;
  savedAt: string;
}

interface StoredSavedModelsState {
  savedModels: StoredVideoModelRecord[];
  activeConfig?: {
    remoteModelId?: string;
    remoteEndpoint?: string;
    remoteProvider?: RemoteProviderHint;
    secretEnvName?: string;
    openrouterModel?: string;
    openrouterEndpoint?: string;
    rendererPresetId?: string;
  };
}

const VALID_PROVIDER_HINTS = new Set<RemoteProviderHint>([
  'auto',
  'openrouter',
  'huggingface-space',
  'dashscope',
  'fal',
  'replicate',
  'huggingface',
  'comfyui',
  'generic',
]);

function readSavedModelsStore(): StoredSavedModelsState {
  try {
    if (!fs.existsSync(SAVED_MODELS_FILE)) {
      return { savedModels: [] };
    }
    const raw = fs.readFileSync(SAVED_MODELS_FILE, 'utf8');
    const parsed = JSON.parse(raw) as StoredSavedModelsState;
    return {
      savedModels: Array.isArray(parsed.savedModels) ? parsed.savedModels.filter(m => typeof m?.modelId === 'string' && !modelIdentifierError(m.modelId)) : [],
      activeConfig: parsed.activeConfig || undefined,
    };
  } catch {
    return { savedModels: [] };
  }
}

function writeSavedModelsStore(state: StoredSavedModelsState) {
  fs.writeFileSync(SAVED_MODELS_FILE, JSON.stringify(state, null, 2), 'utf8');
}

const activeRemoteTasks = new Map<string, TrackedTask>();

interface CachedOpenRouterFreeCatalog {
  models: OpenRouterModelOption[];
  source: 'live' | 'fallback';
  updatedAt: string;
  expiresAt: number;
}

let cachedFreeModels: CachedOpenRouterFreeCatalog | null = null;

async function fetchFreeOpenRouterModels(forceRefresh = false): Promise<CachedOpenRouterFreeCatalog> {
  if (!forceRefresh && cachedFreeModels && cachedFreeModels.expiresAt > Date.now()) {
    return cachedFreeModels;
  }

  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'MZ Vids Studio',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new Error(`OpenRouter models catalog returned ${res.status}`);
    }
    const json = (await res.json()) as { data?: unknown };
    const parsed = parseFreeOpenRouterModels(json.data);
    if (parsed.length > 0) {
      cachedFreeModels = {
        models: parsed,
        source: 'live',
        updatedAt: new Date().toISOString(),
        expiresAt: Date.now() + 10 * 60 * 1000,
      };
      return cachedFreeModels;
    }
  } catch {
    // Fall back safely to cached or built-in free OpenRouter models
  }

  if (cachedFreeModels) {
    return cachedFreeModels;
  }

  return {
    models: [...DEFAULT_FREE_OPENROUTER_MODELS],
    source: 'fallback',
    updatedAt: new Date().toISOString(),
    expiresAt: Date.now() + 2 * 60 * 1000,
  };
}

function pruneOldTasks() {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, task] of activeRemoteTasks.entries()) {
    if (task.createdAt < cutoff) {
      activeRemoteTasks.delete(id);
    }
  }
}

function getEnvHostList(envVarNames: string[]): string[] {
  const hosts: string[] = [];
  for (const key of envVarNames) {
    const raw = process.env[key]?.trim();
    if (!raw) continue;
    try {
      hosts.push(new URL(raw).hostname.toLowerCase());
    } catch {
      // Ignore malformed env value
    }
  }
  return hosts;
}

function readSkillFileSafe(relativePath: string): string {
  const resolved = path.resolve(SKILL_REPO_DIR, relativePath);
  if (!resolved.startsWith(SKILL_REPO_DIR + path.sep)) {
    throw new Error('Invalid skill file path');
  }
  if (!fs.existsSync(resolved)) {
    return '';
  }
  return fs.readFileSync(resolved, 'utf8');
}

function extractMarkdownSection(markdown: string, heading: string, maxLines = 60): string {
  const lines = markdown.split('\n');
  const startIdx = lines.findIndex((line) => line.trim().includes(heading));
  if (startIdx === -1) return lines.slice(0, maxLines).join('\n');
  return lines.slice(startIdx, startIdx + maxLines).join('\n');
}

export async function createApp(options: { frontend?: boolean } = {}) {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/capabilities', (_req, res) => {
    const availableSecretKeys = getAvailableVideoSecretNames(process.env);
    const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());
    const hasWanKeyOnly = Boolean(process.env.WAN_API_KEY?.trim());
    const hasAnyVideoSecret = availableSecretKeys.length > 0;
    const hasWanEndpointEnv = Boolean(process.env.WAN_API_ENDPOINT?.trim());
    const hasWanApiKey = Boolean(hasAnyVideoSecret && hasWanEndpointEnv);
    const hasLocalWanEndpoint = Boolean(process.env.LOCAL_WAN_ENDPOINT?.trim());
    const skillRepoExists = fs.existsSync(path.join(SKILL_REPO_DIR, 'SKILL.md'));

    res.json({
      hasOpenRouterKey,
      hasWanKeyOnly,
      hasAnyVideoSecret,
      availableSecretKeys,
      hasWanEndpointEnv,
      hasWanApiKey,
      hasLocalWanEndpoint,
      skillRepoExists,
      defaultOpenRouterModel:
        process.env.OPENROUTER_MODEL?.trim() || OPENROUTER_PRESET_MODELS[0].id,
      defaultWanModelId: '',
      defaultWanProvider: process.env.WAN_PROVIDER?.trim() || 'auto',
      wanModels: ['wan2_6', 'wan2_7', 'wan3_0', 'wan3_0_prime', 'custom'],
    });
  });

  app.get('/api/saved-models', (_req, res) => {
    res.json(readSavedModelsStore());
  });

  app.get('/api/model-catalog', async (_req, res) => {
    try { res.json(await loadModelCatalog()); }
    catch (err) { res.json({ videoModels: [FREE_LTX_MODEL], textModelIds: [], catalogWarning: 'OpenRouter catalog unavailable. The free LTX demo is still selectable.' }); }
  });

  app.put('/api/saved-models', (req, res) => {
    try {
      const body = (req.body || {}) as StoredSavedModelsState;
      const incomingModels = Array.isArray(body.savedModels) ? body.savedModels.slice(0, 16) : [];
      const sanitizedModels: StoredVideoModelRecord[] = [];
      const allowedSecretSet = new Set<string>(['auto', 'none', ...ALLOWED_VIDEO_SECRET_NAMES]);

      for (const item of incomingModels) {
        if (!item || typeof item !== 'object') continue;
        const modelId = typeof item.modelId === 'string' ? item.modelId.trim().slice(0, 180) : '';
        if (!modelId) continue;
        const modelError = modelIdentifierError(modelId);
        if (modelError) { res.status(400).json({ error: modelError }); return; }
        const endpoint = typeof item.endpoint === 'string' ? item.endpoint.trim().slice(0, 400) : '';
        if (endpoint) {
          const check = validateAllowedHttpsEndpoint(
            endpoint,
            'video',
            getEnvHostList(['WAN_API_ENDPOINT'])
          );
          if (!check.allowed) {
            res.status(400).json({ error: check.reason || 'Invalid saved model endpoint URL.' });
            return;
          }
        }
        const provider: RemoteProviderHint = VALID_PROVIDER_HINTS.has(item.provider)
          ? item.provider
          : 'auto';
        const secretEnvName =
          typeof item.secretEnvName === 'string' && allowedSecretSet.has(item.secretEnvName.trim())
            ? item.secretEnvName.trim()
            : 'auto';
        sanitizedModels.push({
          id: typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 80) : `model-${Date.now()}`,
          modelId,
          endpoint,
          provider,
          secretEnvName,
          savedAt: typeof item.savedAt === 'string' ? item.savedAt : new Date().toISOString(),
        });
      }

      const rawActive = body.activeConfig;
      const activeModelError = modelIdentifierError(rawActive?.remoteModelId || '');
      if (activeModelError) { res.status(400).json({ error: activeModelError }); return; }
      const sanitizedActive: StoredSavedModelsState['activeConfig'] = rawActive
        ? {
            rendererPresetId: typeof rawActive.rendererPresetId === 'string' ? rawActive.rendererPresetId.slice(0, 80) : '',
            remoteModelId:
              typeof rawActive.remoteModelId === 'string'
                ? rawActive.remoteModelId.trim().slice(0, 180)
                : '',
            remoteEndpoint:
              typeof rawActive.remoteEndpoint === 'string'
                ? rawActive.remoteEndpoint.trim().slice(0, 400)
                : '',
            remoteProvider:
              rawActive.remoteProvider && VALID_PROVIDER_HINTS.has(rawActive.remoteProvider)
                ? rawActive.remoteProvider
                : 'auto',
            secretEnvName:
              typeof rawActive.secretEnvName === 'string' &&
              allowedSecretSet.has(rawActive.secretEnvName.trim())
                ? rawActive.secretEnvName.trim()
                : 'auto',
            openrouterModel:
              typeof rawActive.openrouterModel === 'string'
                ? rawActive.openrouterModel.trim().slice(0, 180)
                : undefined,
            openrouterEndpoint:
              typeof rawActive.openrouterEndpoint === 'string'
                ? rawActive.openrouterEndpoint.trim().slice(0, 400)
                : undefined,
          }
        : undefined;

      const nextState: StoredSavedModelsState = {
        savedModels: sanitizedModels,
        activeConfig: sanitizedActive,
      };
      writeSavedModelsStore(nextState);
      res.json(nextState);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to persist saved models.',
      });
    }
  });

  app.get('/api/openrouter/models', async (req, res) => {
    const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
    const catalog = await fetchFreeOpenRouterModels(forceRefresh);
    res.json({
      source: catalog.source,
      updatedAt: catalog.updatedAt,
      count: catalog.models.length,
      models: catalog.models,
    });
  });

  app.get('/api/skills/docs', (_req, res) => {
    try {
      const modelsDeepRef = readSkillFileSafe('skills/higgsfield-models/MODELS-DEEP-REFERENCE.md');
      const rootSkill = readSkillFileSafe('SKILL.md');
      const snapshotRaw = readSkillFileSafe('specs/models_explore_snapshot_2026-09-26.json');

      let wan3CatalogSpecs: unknown[] = [];
      let unlimModelIds: string[] = [];
      let openWeightModelIds: string[] = [];
      if (snapshotRaw) {
        const parsed = JSON.parse(snapshotRaw) as {
          items?: Array<{ id?: string; tags?: string[]; supports_unlim?: boolean }>;
        };
        const items = parsed.items || [];
        wan3CatalogSpecs = items.filter(
          (item) =>
            item.id === 'wan2_6' ||
            item.id === 'wan2_7' ||
            item.id === 'wan3_0' ||
            item.id === 'wan3_0_prime'
        );
        unlimModelIds = items.filter((item) => item.supports_unlim).map((i) => String(i.id));
        openWeightModelIds = items
          .filter((item) => item.tags?.includes('open-weight'))
          .map((i) => String(i.id));
      }

      res.json({
        repoName: 'OSideMedia/higgsfield-ai-prompt-skill',
        wan26Section: extractMarkdownSection(modelsDeepRef, '### Wan 2.5 / Wan 2.6', 16),
        wan3Section: extractMarkdownSection(modelsDeepRef, '### Wan 3.0 / Wan 3.0 Prime', 50),
        mcslaSection: extractMarkdownSection(rootSkill, '### Build the Prompt Using the MCSLA Formula', 45),
        wan3CatalogSpecs,
        openWeightModelIds,
        unlimModelIds,
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load cloned skill documentation.',
      });
    }
  });

  app.post('/api/openrouter/refine', async (req, res) => {
    try {
      const body = req.body as {
        prompt?: string;
        modelId?: string;
        remoteModelId?: string;
        openrouterModel?: string;
        openrouterEndpoint?: string;
        secretEnvName?: string;
        cameraPresetId?: string;
        stylePresetId?: string;
        duration?: number;
        resolution?: string;
        aspectRatio?: string;
        mediaMode?: 'frames' | 'references';
        singleShot?: boolean;
        generateAudio?: boolean;
        images?: Array<{ name: string; dataUrl: string }>;
      };

      const rawPrompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      if (!rawPrompt) {
        res.status(400).json({ error: 'Prompt text is required before enhancing.' });
        return;
      }

      const openrouterModel =
        typeof body.openrouterModel === 'string' && body.openrouterModel.trim().length > 0
          ? body.openrouterModel.trim()
          : process.env.OPENROUTER_MODEL?.trim() || OPENROUTER_PRESET_MODELS[0].id;

      const requestedLlmEndpoint =
        typeof body.openrouterEndpoint === 'string' && body.openrouterEndpoint.trim().length > 0
          ? body.openrouterEndpoint.trim()
          : 'https://openrouter.ai/api/v1/chat/completions';

      const llmEndpointCheck = validateAllowedHttpsEndpoint(
        requestedLlmEndpoint,
        'llm',
        getEnvHostList(['OPENROUTER_ENDPOINT'])
      );
      if (!llmEndpointCheck.allowed || !llmEndpointCheck.normalizedUrl) {
        res.status(400).json({
          error: llmEndpointCheck.reason || 'Invalid OpenRouter endpoint URL.',
        });
        return;
      }

      const wanModelId = body.remoteModelId?.trim() || body.modelId || 'custom';
      const cameraId = body.cameraPresetId || 'dolly-in';
      const styleId = body.stylePresetId || 'cinematic';
      const duration = typeof body.duration === 'number' ? body.duration : 5;
      const resolution = body.resolution || '720p';
      const aspectRatio = body.aspectRatio || '16:9';
      const mediaMode = body.mediaMode === 'references' ? 'references' : 'frames';
      const singleShot = Boolean(body.singleShot);
      const generateAudio = body.generateAudio !== false;
      const images = Array.isArray(body.images) ? body.images.slice(0, 10) : [];

      const apiKey = resolveVideoSecretKey('openrouter', body.secretEnvName, process.env).apiKey;
      if (!apiKey) {
        res.status(400).json({ error: 'Configure the saved director secret in Settings → Secrets before enhancing the prompt.' });
        return;
      }

      const camera = CAMERA_PRESETS.find((c) => c.id === cameraId);
      const style = STYLE_PRESETS.find((s) => s.id === styleId);

      const systemInstruction = [
        `You are a technical ${wanModelId} cinematographer and prompt compiler grounded in the Higgsfield AI Prompt Skill.`,
        'Format the user creative brief into structured video prompt choreography:',
        '[Overall description] + [Reference citation: Image 1 / Image 2...] + [Shot N (start-end s): subject + scene + motion + aesthetic] + [Style / Mood].',
        'Rules:',
        '- Preserve 100% of the user creative intent, subject, and tone without moralizing, lecturing, censoring, or refusing.',
        '- Respect the exact Duration, Resolution, Aspect Ratio, Single Shot setting, Camera Preset, and Style Preset below.',
        '- If starting/reference images are provided, describe what moves and changes rather than contradicting the image.',
        '- Include exact camera preset phrasing when specified and avoid generic buzzwords like "stunning" or "epic".',
        '- Keep total video prompt concise (under 180 words).',
        'Respond strictly as JSON with keys: "refinedPrompt" (string), "audioCue" (string), "negativePrompt" (string).',
      ].join('\n');

      const userSummary = [
        `Target Video Model: ${wanModelId}`,
        `User Prompt: ${rawPrompt}`,
        `Mode: ${mediaMode === 'frames' ? 'Start/End Frame I2V' : 'Multimodal Reference R2V'}`,
        `Uploaded Images Count: ${images.length}`,
        `Duration: ${duration === -1 ? 'Smart (-1)' : `${duration}s`}`,
        `Resolution / Quality: ${resolution} · Aspect Ratio: ${aspectRatio}`,
        `Single Shot Lock: ${singleShot ? 'Yes (include "Generate single shot." first)' : 'No (multi-shot beats allowed)'}`,
        `Selected Camera Preset: ${camera ? `${camera.name} (${camera.promptPhrase})` : 'None'}`,
        `Selected Style Preset: ${style ? `${style.name} (${style.lookDirective})` : 'Natural'}`,
        `Generate Audio: ${generateAudio ? 'Yes' : 'No'}`,
      ].join('\n');

      // Attach inline data URLs only when they are valid data:image/* URIs
      const contentParts: Array<
        { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
      > = [{ type: 'text', text: userSummary }];

      const liveCatalog = cachedFreeModels?.models || [];
      const presetMeta =
        liveCatalog.find((m) => m.id === openrouterModel) ||
        OPENROUTER_PRESET_MODELS.find((m) => m.id === openrouterModel);
      const attachVision = presetMeta ? presetMeta.vision : false;

      if (attachVision) {
        for (const img of images.slice(0, 3)) {
          if (typeof img.dataUrl === 'string' && img.dataUrl.startsWith('data:image/')) {
            contentParts.push({
              type: 'image_url',
              image_url: { url: img.dataUrl },
            });
          }
        }
      }

      const upstreamRes = await fetch(llmEndpointCheck.normalizedUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
          'X-Title': 'MZ Vids Studio',
        },
        body: JSON.stringify({
          model: openrouterModel,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: contentParts.length > 1 ? contentParts : userSummary },
          ],
          temperature: 0.7,
        }),
      });

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text();
        res.status(upstreamRes.status).json({
          error: `OpenRouter API error (${upstreamRes.status}): ${errText.slice(0, 300)}`,
        });
        return;
      }

      const data = (await upstreamRes.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const rawContent = data.choices?.[0]?.message?.content?.trim() || '';

      let parsed: { refinedPrompt?: string; audioCue?: string; negativePrompt?: string } = {};
      try {
        const cleanedJson = rawContent
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```$/i, '')
          .trim();
        parsed = JSON.parse(cleanedJson);
      } catch {
        parsed = {
          refinedPrompt: rawContent || rawPrompt,
          audioCue: '',
          negativePrompt: '',
        };
      }

      res.json({
        mode: 'openrouter',
        model: openrouterModel,
        refinedPrompt: parsed.refinedPrompt || rawPrompt,
        audioCue: parsed.audioCue || '',
        negativePrompt: parsed.negativePrompt || '',
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'OpenRouter prompt refinement failed.',
      });
    }
  });

  app.post('/api/wan/generate', async (req, res) => {
    try {
      let input = req.body as Wan3GenerationInput;
      const validation = validateWan3Payload(input);
      if (!validation.valid) {
        res.status(400).json({
          error: validation.errors.join(' '),
          validation,
        });
        return;
      }

      // Starter assets are local paths in the preview; providers need actual image bytes.
      const providerAsset = (asset: NonNullable<Wan3GenerationInput['startImage']>) => {
        if (!asset.dataUrl.startsWith('/src/assets/images/')) return asset;
        const root = path.resolve(__dirname, 'src/assets/images');
        const filename = path.resolve(__dirname, `.${asset.dataUrl}`);
        if (!filename.startsWith(root + path.sep)) throw new Error('Invalid reference asset path.');
        const mime = /\.png$/i.test(filename) ? 'image/png' : /\.webp$/i.test(filename) ? 'image/webp' : 'image/jpeg';
        return { ...asset, dataUrl: `data:${mime};base64,${fs.readFileSync(filename).toString('base64')}` };
      };
      input = {
        ...input,
        startImage: input.startImage ? providerAsset(input.startImage) : null,
        endImage: input.endImage ? providerAsset(input.endImage) : null,
        referenceImages: input.referenceImages?.map(providerAsset),
      };

      let directorModel: string | undefined;
      let directorScript: string | undefined;
      // Resolve the selected saved model before legacy environment endpoints can override it.
      if (input.remoteProvider === 'openrouter' ||
          ((!input.remoteProvider || input.remoteProvider === 'auto') && !input.remoteEndpoint &&
           !input.remoteModelId?.startsWith('fal-ai/'))) {
        const catalog = await loadModelCatalog();
        const selection = selectGenerationRoute(input, readSavedModelsStore().savedModels, catalog);
        const videoSpec = catalog.videoModels.find(m => m.id === selection.videoInput.remoteModelId);
        if (videoSpec) validateVideoModelSettings(selection.videoInput, videoSpec);
        // Validate both bindings before spending tokens on the director.
        const rendererProvider = selection.videoInput.remoteProvider === 'huggingface-space' ? 'huggingface-space' : 'openrouter';
        const rendererKey = resolveVideoSecretKey(rendererProvider, selection.videoInput.secretEnvName, process.env);
        if (!rendererKey.apiKey && rendererProvider !== 'huggingface-space') throw new Error('Set OPENROUTER_API_KEY in Settings → Secrets for the selected video model.');
        if (rendererProvider === 'huggingface-space') validateLtxInput(selection.videoInput);
        directorModel = selection.directorModel;
        if (directorModel) {
          const directorKey = resolveVideoSecretKey('openrouter', selection.directorSecret, process.env);
          if (!directorKey.apiKey) throw new Error('Set OPENROUTER_API_KEY in Settings → Secrets for the saved director.');
          directorScript = await writeVideoScript(input, directorModel, directorKey.apiKey, catalog.visionModelIds?.includes(directorModel));
        }
        input = selection.videoInput;
      }
      const job = buildWan3CompiledJob(input);
      if (directorScript) job.compiledPrompt += `\n\nShooting script by ${directorModel} (follow the original prompt above):\n${directorScript}`;
      const effectiveModel = getEffectiveModelId(input);
      if (input.remoteProvider === 'huggingface-space') {
        const secret = resolveVideoSecretKey('huggingface-space', input.secretEnvName, process.env);
        const taskId = await submitLtxVideo(input, job, secret.apiKey);
        res.json({
          status: 'submitted', provider: 'huggingface-space', taskId, videoUrl: null, job, validation,
          appliedConfig: { model: effectiveModel, provider: 'huggingface-space', endpoint: LTX_SPACE_URL, secretUsed: secret.secretUsed || 'none', directorModel },
          notice: 'Submitted to the free official LTX demo. Shared GPU queue and daily quota apply. No paid renderer fallback is used.',
        });
        return;
      }
      const localEndpoint = process.env.LOCAL_WAN_ENDPOINT?.trim();
      const wanProviderHint = input.remoteProvider || process.env.WAN_PROVIDER?.trim();
      const endpointResolution = resolveEffectiveVideoEndpoint(
        input,
        process.env.WAN_API_ENDPOINT,
        process.env
      );

      // 1. Public HTTPS Cloud Video Endpoint (explicit UI endpoint, Secrets env endpoint, or auto-derived from Saved Model + Provider)
      if (endpointResolution.endpoint) {
        const endpointCheck = validateAllowedHttpsEndpoint(
          endpointResolution.endpoint,
          'video',
          getEnvHostList(['WAN_API_ENDPOINT'])
        );
        if (!endpointCheck.allowed || !endpointCheck.normalizedUrl) {
          res.status(400).json({
            error:
              endpointCheck.reason ||
              'Configured video endpoint must be an allowlisted HTTPS URL.',
          });
          return;
        }

        const providerKind = detectWanProvider(endpointCheck.normalizedUrl, wanProviderHint);
        if (providerKind === 'openrouter' && endpointCheck.normalizedUrl !== 'https://openrouter.ai/api/v1/videos') {
          res.status(400).json({ error: 'OpenRouter video models require https://openrouter.ai/api/v1/videos.' });
          return;
        }
        const secretResolution = resolveVideoSecretKey(
          providerKind,
          input.secretEnvName,
          process.env
        );
        const payload = buildProviderRequestPayload(providerKind, input, job);
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
          ...payload.headers,
        };
        if (secretResolution.apiKey) {
          headers.Authorization =
            providerKind === 'fal'
              ? `Key ${secretResolution.apiKey}`
              : `Bearer ${secretResolution.apiKey}`;
        }

        const providerRes = await fetch(endpointCheck.normalizedUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload.body),
          signal: AbortSignal.timeout(45000),
        });

        const contentType = (providerRes.headers.get('content-type') || '').toLowerCase();
        if (
          providerRes.ok &&
          (contentType.startsWith('video/') || contentType === 'application/octet-stream')
        ) {
          const videoBytes = Buffer.from(await providerRes.arrayBuffer());
          const mime = contentType.startsWith('video/') ? contentType.split(';')[0] : 'video/mp4';
          const appliedConfig = {
            model: effectiveModel,
            provider: providerKind,
            endpoint: endpointCheck.normalizedUrl,
            endpointSource: endpointResolution.source,
            secretUsed: secretResolution.secretUsed || 'none',
            directorModel,
          };
          res.json({
            status: 'completed',
            provider: providerKind,
            videoUrl: `data:${mime};base64,${videoBytes.toString('base64')}`,
            taskId: null,
            job,
            validation,
            appliedConfig,
            notice: `Generated by ${effectiveModel} via ${providerKind} (${appliedConfig.secretUsed}).`,
          });
          return;
        }

        const providerData = (await providerRes.json().catch(() => ({}))) as Record<string, unknown>;

        if (!providerRes.ok) {
          if (providerRes.status === 401 || providerRes.status === 403) {
            res.status(providerRes.status).json({
              error: `Authentication required (${providerRes.status}) for ${new URL(
                endpointCheck.normalizedUrl
              ).hostname}. Add a matching provider key (e.g. HF_TOKEN, FAL_KEY, REPLICATE_API_TOKEN, DASHSCOPE_API_KEY, VIDEO_API_KEY, or WAN_API_KEY) in Settings -> Secrets and bind it in Saved Models.`,
              job,
            });
            return;
          }
          if (providerRes.status === 503 && providerKind === 'huggingface') {
            const est =
              typeof providerData.estimated_time === 'number'
                ? ` (estimated load: ${Math.ceil(providerData.estimated_time)}s)`
                : '';
            res.status(503).json({
              error: `Hugging Face model "${effectiveModel}" is warming up${est}. Retry shortly or switch endpoints.`,
              job,
            });
            return;
          }
          res.status(providerRes.status).json({
            error:
              (typeof providerData.error === 'string' && providerData.error) ||
              (typeof providerData.message === 'string' && providerData.message) ||
              (typeof providerData.detail === 'string' && providerData.detail) ||
              `Video endpoint (${endpointCheck.normalizedUrl}) returned ${providerRes.status}`,
            job,
          });
          return;
        }

        const extracted = extractVideoAndTask(providerData);
        if (!extracted.videoUrl && !extracted.taskId) {
          res.status(502).json({ error: 'The selected provider returned neither a video nor a job ID. No substitute video was created.' });
          return;
        }
        if (extracted.taskId && !extracted.videoUrl) {
          pruneOldTasks();
          let pollUrl = `${endpointCheck.normalizedUrl.replace(/\/+$/, '')}/${encodeURIComponent(
            extracted.taskId
          )}`;
          if (providerKind === 'dashscope') {
            pollUrl = `${new URL(endpointCheck.normalizedUrl).origin}/api/v1/tasks/${encodeURIComponent(
              extracted.taskId
            )}`;
          } else if (extracted.statusUrl) {
            const statusCheck = validateAllowedHttpsEndpoint(
              extracted.statusUrl,
              'video',
              getEnvHostList(['WAN_API_ENDPOINT'])
            );
            if (statusCheck.allowed && statusCheck.normalizedUrl &&
                new URL(statusCheck.normalizedUrl).origin === new URL(endpointCheck.normalizedUrl).origin) {
              pollUrl = statusCheck.normalizedUrl;
            }
          }
          let safeResponseUrl: string | null = null;
          if (extracted.responseUrl) {
            const respCheck = validateAllowedHttpsEndpoint(
              extracted.responseUrl,
              'video',
              getEnvHostList(['WAN_API_ENDPOINT'])
            );
            if (respCheck.allowed && respCheck.normalizedUrl &&
                new URL(respCheck.normalizedUrl).origin === new URL(endpointCheck.normalizedUrl).origin) {
              safeResponseUrl = respCheck.normalizedUrl;
            }
          }

          activeRemoteTasks.set(extracted.taskId, {
            pollUrl,
            responseUrl: safeResponseUrl,
            provider: providerKind,
            secretUsed: secretResolution.secretUsed,
            isLocalGpu: false,
            createdAt: Date.now(),
          });
        }

        const appliedConfig = {
          model: effectiveModel,
          provider: providerKind,
          endpoint: endpointCheck.normalizedUrl,
          endpointSource: endpointResolution.source,
          secretUsed: secretResolution.secretUsed || 'none',
          directorModel,
        };

        res.json({
          status: extracted.videoUrl ? 'completed' : 'submitted',
          provider: providerKind,
          videoUrl: extracted.videoUrl,
          taskId: extracted.taskId,
          job,
          validation,
          appliedConfig,
          notice: extracted.videoUrl
            ? `Generated by ${effectiveModel} via ${providerKind} (${appliedConfig.secretUsed}).`
            : `Submitted ${effectiveModel} job to ${providerKind} (${appliedConfig.secretUsed}).`,
        });
        return;
      }

      // 2. Self-hosted open-weight GPU endpoint (trusted server-side env URL)
      if (localEndpoint) {
        let parsedLocal: URL;
        try {
          parsedLocal = new URL(localEndpoint);
          if (parsedLocal.protocol !== 'http:' && parsedLocal.protocol !== 'https:') {
            throw new Error('Unsupported protocol');
          }
        } catch {
          res.status(400).json({
            error: 'Configured LOCAL_WAN_ENDPOINT must be a valid HTTP or HTTPS URL.',
          });
          return;
        }

        const providerKind = detectWanProvider(localEndpoint, wanProviderHint || 'generic');
        const payload = buildProviderRequestPayload(providerKind, input, job);
        const localSecret = resolveVideoSecretKey(providerKind, input.secretEnvName, process.env);
        const localHeaders: Record<string, string> = { 'Content-Type': 'application/json', ...payload.headers };
        if (localSecret.apiKey) localHeaders.Authorization = providerKind === 'fal' ? `Key ${localSecret.apiKey}` : `Bearer ${localSecret.apiKey}`;

        const localRes = await fetch(parsedLocal.toString(), {
          method: 'POST',
          headers: localHeaders,
          body: JSON.stringify(payload.body),
        });

        const localContentType = (localRes.headers.get('content-type') || '').toLowerCase();
        if (
          localRes.ok &&
          (localContentType.startsWith('video/') || localContentType === 'application/octet-stream')
        ) {
          const videoBytes = Buffer.from(await localRes.arrayBuffer());
          const mime = localContentType.startsWith('video/')
            ? localContentType.split(';')[0]
            : 'video/mp4';
          res.json({
            status: 'completed',
            provider: 'local-gpu',
            videoUrl: `data:${mime};base64,${videoBytes.toString('base64')}`,
            taskId: null,
            job,
            validation,
            appliedConfig: {
              model: effectiveModel,
              provider: 'local-gpu',
              endpoint: localEndpoint,
              endpointSource: 'env',
              secretUsed: localSecret.secretUsed || 'none',
            },
            notice: `Rendered via self-hosted ${effectiveModel} GPU endpoint.`,
          });
          return;
        }

        const localData = (await localRes.json().catch(() => ({}))) as Record<string, unknown>;

        if (!localRes.ok) {
          res.status(localRes.status).json({
            error:
              (typeof localData.error === 'string' && localData.error) ||
              (typeof localData.message === 'string' && localData.message) ||
              `Local GPU endpoint returned ${localRes.status}`,
            job,
          });
          return;
        }

        const extracted = extractVideoAndTask(localData);
        if (extracted.taskId && !extracted.videoUrl) {
          pruneOldTasks();
          activeRemoteTasks.set(extracted.taskId, {
            pollUrl: `${localEndpoint.replace(/\/+$/, '')}/${encodeURIComponent(extracted.taskId)}`,
            responseUrl: null,
            provider: providerKind,
            secretUsed: localSecret.secretUsed,
            isLocalGpu: true,
            createdAt: Date.now(),
          });
        }

        res.json({
          status: extracted.videoUrl ? 'completed' : 'submitted',
          provider: 'local-gpu',
          videoUrl: extracted.videoUrl,
          taskId: extracted.taskId,
          job,
          validation,
          appliedConfig: {
            model: effectiveModel,
            provider: 'local-gpu',
            endpoint: localEndpoint,
            endpointSource: 'env',
            secretUsed: localSecret.secretUsed || 'none',
          },
          notice: extracted.videoUrl
            ? `Rendered via self-hosted ${effectiveModel} GPU endpoint.`
            : `Job submitted to self-hosted ${effectiveModel} GPU endpoint.`,
        });
        return;
      }

      res.status(400).json({ error: `No video endpoint is configured for "${effectiveModel}". Select a video-capable saved model and its provider.`, job });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Video generation error.',
      });
    }
  });

  app.get('/api/wan/status/:taskId', async (req, res) => {
    try {
      const taskId = String(req.params.taskId || '').replace(/[^a-zA-Z0-9_-]/g, '');
      if (!taskId) {
        res.status(400).json({ error: 'Invalid task ID.' });
        return;
      }

      const tracked = activeRemoteTasks.get(taskId);
      const ltxTask = getLtxTask(taskId);
      if (ltxTask) { res.json(ltxTask); return; }
      const localEndpoint = process.env.LOCAL_WAN_ENDPOINT?.trim();
      const wanEndpoint = process.env.WAN_API_ENDPOINT?.trim();

      if (tracked) {
        const headers: Record<string, string> = {};
        if (!tracked.isLocalGpu || tracked.secretUsed) {
          const resolved = resolveVideoSecretKey(
            tracked.provider,
            tracked.secretUsed || 'auto',
            process.env
          );
          if (resolved.apiKey) {
            headers.Authorization =
              tracked.provider === 'fal'
                ? `Key ${resolved.apiKey}`
                : `Bearer ${resolved.apiKey}`;
          }
        }

        const statusRes = await fetch(tracked.pollUrl, { headers });
        const data = (await statusRes.json().catch(() => ({}))) as Record<string, unknown>;
        if (!statusRes.ok) {
          res.status(statusRes.status).json({ error: `Video provider status request failed (${statusRes.status}).` });
          return;
        }
        let extracted = extractVideoAndTask(data);
        const output =
          data.output && typeof data.output === 'object' && !Array.isArray(data.output)
            ? (data.output as Record<string, unknown>)
            : null;
        const remoteStatus =
          (output && typeof output.task_status === 'string' && output.task_status) ||
          (typeof data.status === 'string' && data.status) ||
          'pending';

        // fal.ai Queue returns COMPLETED with response_url containing the final { video: { url } } payload
        if (
          !extracted.videoUrl &&
          tracked.responseUrl &&
          ['COMPLETED', 'SUCCEEDED', 'SUCCESS'].includes(remoteStatus.toUpperCase())
        ) {
          const resultRes = await fetch(tracked.responseUrl, { headers });
          const resultData = (await resultRes.json().catch(() => ({}))) as Record<string, unknown>;
          const fromResult = extractVideoAndTask(resultData);
          if (fromResult.videoUrl) {
            extracted = { ...extracted, videoUrl: fromResult.videoUrl };
          }
        }

        if (tracked.provider === 'openrouter' && remoteStatus.toLowerCase() === 'completed') {
          tracked.completed = true;
          extracted.videoUrl = `/api/video/content/${encodeURIComponent(taskId)}`;
        }

        if (
          (extracted.videoUrl && tracked.provider !== 'openrouter') ||
          ['FAILED', 'ERROR', 'CANCELED', 'CANCELLED'].includes(remoteStatus.toUpperCase())
        ) {
          activeRemoteTasks.delete(taskId);
        }

        res.json({
          status: remoteStatus,
          videoUrl: extracted.videoUrl,
          error:
            typeof data.error === 'string'
              ? data.error
              : ['FAILED', 'ERROR'].includes(remoteStatus.toUpperCase())
                ? `Remote job ended with status ${remoteStatus}`
                : null,
        });
        return;
      }

      if (localEndpoint) {
        const base = localEndpoint.replace(/\/+$/, '');
        const statusRes = await fetch(`${base}/${encodeURIComponent(taskId)}`);
        const data = (await statusRes.json().catch(() => ({}))) as Record<string, unknown>;
        const extracted = extractVideoAndTask(data);
        res.json({
          status: (typeof data.status === 'string' && data.status) || 'pending',
          videoUrl: extracted.videoUrl,
        });
        return;
      }

      if (wanEndpoint) {
        const check = validateAllowedHttpsEndpoint(
          wanEndpoint,
          'video',
          getEnvHostList(['WAN_API_ENDPOINT'])
        );
        if (!check.allowed || !check.normalizedUrl) {
          res.status(400).json({ error: check.reason || 'Invalid WAN_API_ENDPOINT.' });
          return;
        }
        const providerKind = detectWanProvider(
          check.normalizedUrl,
          process.env.WAN_PROVIDER?.trim()
        );
        const resolved = resolveVideoSecretKey(providerKind, 'auto', process.env);
        let pollUrl = `${check.normalizedUrl.replace(/\/+$/, '')}/${encodeURIComponent(taskId)}`;
        if (providerKind === 'dashscope') {
          const origin = new URL(check.normalizedUrl).origin;
          pollUrl = `${origin}/api/v1/tasks/${encodeURIComponent(taskId)}`;
        }
        const headers: Record<string, string> = {};
        if (resolved.apiKey) {
          headers.Authorization =
            providerKind === 'fal' ? `Key ${resolved.apiKey}` : `Bearer ${resolved.apiKey}`;
        }
        const statusRes = await fetch(pollUrl, { headers });
        const data = (await statusRes.json().catch(() => ({}))) as Record<string, unknown>;
        const extracted = extractVideoAndTask(data);
        const output =
          data.output && typeof data.output === 'object' && !Array.isArray(data.output)
            ? (data.output as Record<string, unknown>)
            : null;
        const remoteStatus =
          (output && typeof output.task_status === 'string' && output.task_status) ||
          (typeof data.status === 'string' && data.status) ||
          'pending';

        res.json({
          status: remoteStatus,
          videoUrl: extracted.videoUrl,
        });
        return;
      }

      res.status(404).json({ error: 'No active remote video task found.' });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to poll remote video status.',
      });
    }
  });

  app.get('/api/video/content/:taskId', async (req, res) => {
    try {
      const taskId = String(req.params.taskId);
      const tracked = activeRemoteTasks.get(taskId);
      if (!tracked || tracked.provider !== 'openrouter' || !tracked.completed) {
        res.status(404).json({ error: 'Completed video job not found. Please generate again if the server restarted.' });
        return;
      }
      const secret = resolveVideoSecretKey('openrouter', tracked.secretUsed || 'auto', process.env);
      if (!secret.apiKey) throw new Error('Video secret is no longer configured.');
      const result = await fetch(openRouterContentUrl(taskId), {
        headers: { Authorization: `Bearer ${secret.apiKey}` }, signal: AbortSignal.timeout(90000),
      });
      if (!result.ok) { res.status(result.status).json({ error: 'Video download failed at the provider.' }); return; }
      res.setHeader('Content-Type', result.headers.get('content-type') || 'video/mp4');
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(Buffer.from(await result.arrayBuffer()));
    } catch (err) { res.status(502).json({ error: err instanceof Error ? err.message : 'Video download failed.' }); }
  });

  if (options.frontend === false) return app;

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  createApp().then(app => app.listen(PORT, '0.0.0.0', () => {
    console.log(`MZ Vids Studio listening on http://localhost:${PORT}`);
  })).catch(err => { console.error('Failed to start server:', err); process.exit(1); });
}
