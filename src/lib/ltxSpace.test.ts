import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../server.ts';
import { FREE_LTX_MODEL, modelIdentifierError, selectGenerationRoute } from './modelRouting.ts';
import { LTX_SPACE_URL, parseLtxEvent, validateLtxInput } from './ltxSpace.ts';
import { resolveVideoSecretKey } from './providerAdapters.ts';
import { validateWan3Payload, type Wan3GenerationInput } from './wan3.ts';

const input: Wan3GenerationInput = {
  modelId: 'custom', remoteModelId: FREE_LTX_MODEL.id, remoteProvider: 'huggingface-space',
  secretEnvName: 'none', prompt: 'A red fox jumps across a creek and turns to the camera.',
  duration: 2, resolution: '480p', aspectRatio: '16:9', generateAudio: false,
  enableThinking: false, singleShot: true, cameraPresetId: 'static', stylePresetId: 'cinematic', mediaMode: 'frames',
};

test('secret names and credential values cannot become saved model IDs', () => {
  for (const name of ['WAN_API_KEY', 'OPENROUTER_API_KEY', 'HF_TOKEN', 'hf_fakecredential1234567', 'sk-or-fake']) {
    assert.ok(modelIdentifierError(name));
    assert.equal(validateWan3Payload({ ...input, remoteModelId: name }).valid, false);
  }
  assert.equal(modelIdentifierError(FREE_LTX_MODEL.id), null);
});

test('free LTX supports keyless binding and rejects unrelated provider credentials', () => {
  assert.deepEqual(resolveVideoSecretKey('huggingface-space', 'auto', { OPENROUTER_API_KEY: 'unused', WAN_API_KEY: 'unused' }), { apiKey: null, secretUsed: null });
  assert.throws(() => resolveVideoSecretKey('huggingface-space', 'OPENROUTER_API_KEY', { OPENROUTER_API_KEY: 'unused' }), /cannot be used/);
  validateLtxInput(input);
  assert.throws(() => validateLtxInput({ ...input, generateAudio: true }), /no native audio/);
  assert.throws(() => validateLtxInput({ ...input, duration: 12 }), /duration/);
  const selected = selectGenerationRoute({ ...input, remoteProvider: 'auto' }, [], { videoModels: [FREE_LTX_MODEL], textModelIds: [] });
  assert.equal(selected.videoInput.remoteProvider, 'huggingface-space');
});

test('LTX queue events expose actual video URLs and reject unexpected hosts', () => {
  const event = (url: string) => `event: complete\ndata: ${JSON.stringify([{ video: { url } }, 42])}`;
  assert.deepEqual(parseLtxEvent(event(`${LTX_SPACE_URL}/gradio_api/file=/tmp/result.mp4`)), { videoUrl: `${LTX_SPACE_URL}/gradio_api/file=/tmp/result.mp4` });
  assert.match(parseLtxEvent(event('https://unexpected.example/result.mp4'))!.error!, /unexpected/);
  assert.match(parseLtxEvent('event: error\ndata: "GPU quota exceeded"')!.error!, /quota exceeded/);
  assert.equal(parseLtxEvent('event: heartbeat\ndata: null'), null);
});

test('HTTP free generation uses LTX queue without keys or paid API requests', async () => {
  const original = globalThis.fetch;
  const calls: { url: string; options: any }[] = [];
  globalThis.fetch = (async (url: any, options: any) => {
    const endpoint = String(url);
    if (endpoint.startsWith('http://127.0.0.1:')) return original(url, options);
    calls.push({ url: endpoint, options });
    if (endpoint === `${LTX_SPACE_URL}/gradio_api/call/text_to_video`) {
      return new Response(JSON.stringify({ event_id: 'abcdef12' }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (endpoint.endsWith('/text_to_video/abcdef12')) {
      const encoder = new TextEncoder();
      return new Response(new ReadableStream({ start(controller) {
        controller.enqueue(encoder.encode('event: heartbeat\ndata: null\n\nevent: complete\nda'));
        controller.enqueue(encoder.encode(`ta: ${JSON.stringify([{ video: { url: `${LTX_SPACE_URL}/gradio_api/file=/tmp/video.mp4` } }, 42])}\n\n`));
        controller.close();
      } }));
    }
    throw new Error('Unexpected provider call');
  }) as typeof fetch;
  const app = await createApp({ frontend: false });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const invalidSave = await fetch(`${base}/api/saved-models`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ savedModels: [{ id: 'bad', modelId: 'WAN_API_KEY' }] }) });
    assert.equal(invalidSave.status, 400);
    const generated = await fetch(`${base}/api/wan/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const job = await generated.json();
    assert.equal(generated.status, 200, JSON.stringify(job));
    assert.equal(job.appliedConfig.secretUsed, 'none');
    assert.equal(job.appliedConfig.model, FREE_LTX_MODEL.id);
    await new Promise(resolve => setImmediate(resolve));
    const status = await (await fetch(`${base}/api/wan/status/${job.taskId}`)).json();
    assert.equal(status.status, 'completed');
    assert.equal(status.videoUrl, `${LTX_SPACE_URL}/gradio_api/file=/tmp/video.mp4`);
    assert.ok(calls.every(c => c.url.startsWith(LTX_SPACE_URL) && !c.options.headers.Authorization));
    const submitted = JSON.parse(calls[0].options.body).data;
    assert.ok(submitted[0].includes(input.prompt));
    assert.equal(submitted[6], 'text-to-video');
    assert.equal(submitted[7], input.duration);
  } finally {
    globalThis.fetch = original;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
