import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../../server.ts';
import { selectGenerationRoute, validateVideoModelSettings, type ModelCatalog } from './modelRouting.ts';
import { resolveVideoSecretKey, resolveEffectiveVideoEndpoint } from './providerAdapters.ts';
import type { Wan3GenerationInput } from './wan3.ts';

const catalog: ModelCatalog = {
  textModelIds: ['moonshotai/kimi-k3.1-pro'],
  videoModels: [{ id: 'test/video', name: 'Test Video', supported_durations: [5], supported_resolutions: ['720p'], supported_aspect_ratios: ['16:9'] }],
};
const input: Wan3GenerationInput = {
  modelId: 'custom', remoteModelId: 'moonshotai/kimi-k3.1-pro', remoteProvider: 'auto',
  secretEnvName: 'auto', prompt: 'A red fox jumps across a creek, then turns toward the camera.',
  duration: 5, resolution: '720p', aspectRatio: '16:9', generateAudio: false,
  enableThinking: false, singleShot: true, cameraPresetId: 'static', stylePresetId: 'cinematic', mediaMode: 'frames',
};
const renderer = { id: 'render-1', modelId: 'test/video', endpoint: '', provider: 'openrouter' as const, secretEnvName: 'OPENROUTER_API_KEY', savedAt: '2026-11-21' };

test('saved Kimi is a script director and requires a verified renderer', () => {
  assert.throws(() => selectGenerationRoute(input, [], catalog), /cannot output video/);
  assert.throws(() => selectGenerationRoute({ ...input, rendererPresetId: 'missing' }, [renderer], catalog), /cannot output video/);
  const route = selectGenerationRoute(input, [renderer], catalog);
  assert.equal(route.directorModel, input.remoteModelId);
  assert.equal(route.videoInput.remoteModelId, renderer.modelId);
  assert.equal(route.videoInput.secretEnvName, renderer.secretEnvName);
  assert.equal(route.videoInput.prompt, input.prompt);
  assert.throws(() => validateVideoModelSettings({ ...input, duration: 7 }, catalog.videoModels[0]), /supports duration: 5/);
});

test('OpenRouter binding cannot fall back to Wan and explicit missing bindings fail', () => {
  assert.deepEqual(resolveVideoSecretKey('openrouter', 'auto', { WAN_API_KEY: 'unused' }), { apiKey: null, secretUsed: null });
  assert.throws(() => resolveVideoSecretKey('openrouter', 'FAL_KEY', { OPENROUTER_API_KEY: 'configured' }), /not configured/);
  assert.equal(resolveEffectiveVideoEndpoint({ remoteProvider: 'openrouter', remoteModelId: 'test/video' }, 'https://legacy.invalid').endpoint, 'https://openrouter.ai/api/v1/videos');
});

test('HTTP generation uses saved Kimi, sends its script to the saved renderer, polls, and serves authenticated video', async () => {
  const realFetch = globalThis.fetch;
  const savedPath = path.resolve('.mz-vids-saved-models.json');
  const priorStore = fs.existsSync(savedPath) ? fs.readFileSync(savedPath) : null;
  const priorKey = process.env.OPENROUTER_API_KEY;
  const priorWanEndpoint = process.env.WAN_API_ENDPOINT;
  const calls: { url: string; body?: any; auth?: string }[] = [];
  process.env.OPENROUTER_API_KEY = 'test-only-key';
  process.env.WAN_API_ENDPOINT = 'https://legacy.invalid';
  let failDirector = false;
  let failPoll = false;
  globalThis.fetch = (async (url: any, options: any) => {
    const endpoint = String(url);
    if (endpoint.startsWith('http://127.0.0.1:')) return realFetch(url, options);
    calls.push({ url: endpoint, body: options?.body ? JSON.parse(options.body) : undefined, auth: options?.headers?.Authorization });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
    if (endpoint.endsWith('/videos/models')) return json({ data: catalog.videoModels });
    if (endpoint.endsWith('/v1/models')) return json({ data: [{ id: input.remoteModelId, architecture: { output_modalities: ['text'] } }] });
    if (endpoint.endsWith('/chat/completions')) return failDirector
      ? json({ error: { message: 'Director quota exhausted' } }, 429)
      : json({ choices: [{ message: { content: 'Shot 1: fox jumps. Shot 2: fox turns to camera.' } }] });
    if (endpoint.endsWith('/v1/videos')) return json({ id: 'job-test', status: 'pending', polling_url: 'https://openrouter.ai/api/v1/videos/job-test' });
    if (endpoint.endsWith('/videos/job-test')) return failPoll ? json({ error: 'failure' }, 503) : json({ status: 'completed' });
    if (endpoint.endsWith('/videos/job-test/content')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'video/mp4' } });
    throw new Error(`Unexpected external request: ${endpoint}`);
  }) as typeof fetch;
  const app = await createApp({ frontend: false });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  const post = (payload: Wan3GenerationInput) => fetch(`${base}/api/wan/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  try {
    await fetch(`${base}/api/saved-models`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ savedModels: [], activeConfig: { ...input, rendererPresetId: 'render-1' } }) });
    const missing = await post(input);
    assert.ok(!missing.ok);
    assert.match((await missing.json()).error, /cannot output video/);
    assert.ok(!calls.some(c => c.url.endsWith('/chat/completions') || c.url.endsWith('/v1/videos')));
    const saved = await fetch(`${base}/api/saved-models`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ savedModels: [renderer], activeConfig: { remoteModelId: input.remoteModelId, rendererPresetId: renderer.id } }) });
    assert.equal(saved.status, 200);
    assert.equal((await (await fetch(`${base}/api/saved-models`)).json()).activeConfig.rendererPresetId, renderer.id);
    const generated = await post({ ...input, startImage: {
      id: 'starter', name: 'starter.jpg', role: 'start_image',
      dataUrl: '/src/assets/images/sample_cinematic_scene_1795242162857.jpg',
    } });
    const result = await generated.json();
    assert.equal(generated.status, 200, JSON.stringify(result));
    assert.equal(result.appliedConfig.model, renderer.modelId);
    assert.equal(result.appliedConfig.directorModel, input.remoteModelId);
    const director = calls.find(c => c.url.endsWith('/chat/completions'))!;
    const video = calls.find(c => c.url.endsWith('/v1/videos'))!;
    assert.equal(director.body.model, input.remoteModelId);
    assert.equal(video.body.model, renderer.modelId);
    assert.ok(video.body.prompt.includes(input.prompt));
    assert.match(video.body.prompt, /Shot 1: fox jumps/);
    assert.match(video.body.frame_images[0].image_url.url, /^data:image\/jpeg;base64,/);
    assert.ok(!director.body.messages[1].content.some((part: any) => part.type === 'image_url'));
    assert.equal(video.auth, 'Bearer test-only-key');
    assert.ok(!JSON.stringify(result).includes('test-only-key'));
    failPoll = true;
    assert.equal((await fetch(`${base}/api/wan/status/job-test`)).status, 503);
    failPoll = false;
    const polled = await (await fetch(`${base}/api/wan/status/job-test`)).json();
    assert.equal(polled.videoUrl, '/api/video/content/job-test');
    const content = await fetch(`${base}${polled.videoUrl}`);
    assert.equal(content.headers.get('content-type'), 'video/mp4');
    assert.equal((await content.arrayBuffer()).byteLength, 3);
    failDirector = true;
    const before = calls.filter(c => c.url.endsWith('/v1/videos')).length;
    const rejected = await post(input);
    assert.ok(!rejected.ok);
    assert.match((await rejected.json()).error, /Director quota exhausted/);
    assert.equal(calls.filter(c => c.url.endsWith('/v1/videos')).length, before);
  } finally {
    globalThis.fetch = realFetch;
    if (priorKey === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = priorKey;
    if (priorWanEndpoint === undefined) delete process.env.WAN_API_ENDPOINT; else process.env.WAN_API_ENDPOINT = priorWanEndpoint;
    if (priorStore) fs.writeFileSync(savedPath, priorStore); else if (fs.existsSync(savedPath)) fs.unlinkSync(savedPath);
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
});
