import { randomUUID } from 'node:crypto';
import { FREE_LTX_MODEL, validateVideoModelSettings } from './modelRouting';
import type { Wan3CompiledJob, Wan3GenerationInput } from './wan3';

export const LTX_SPACE_URL = 'https://lightricks-ltx-video-distilled.hf.space';
interface LtxTask { status: 'pending' | 'completed' | 'failed'; videoUrl: string | null; error?: string; createdAt: number }
const tasks = new Map<string, LtxTask>();
export function getLtxTask(id: string): LtxTask | undefined { return tasks.get(id); }

export function validateLtxInput(input: Wan3GenerationInput): void {
  if (input.remoteModelId !== FREE_LTX_MODEL.id) throw new Error('Choose the official LTX free demo model.');
  if (input.remoteEndpoint && input.remoteEndpoint.replace(/\/$/, '') !== LTX_SPACE_URL) throw new Error('The free LTX adapter uses the official Lightricks demo endpoint.');
  validateVideoModelSettings(input, FREE_LTX_MODEL);
  if (input.generateAudio) throw new Error('LTX Video 0.9.8 has no native audio. Turn Native Audio off.');
  if (input.endImage || input.referenceImages?.length) throw new Error('The free LTX demo supports text-to-video or one start image. Clear the end frame and reference images.');
}

export function parseLtxEvent(event: string): { videoUrl?: string; error?: string } | null {
  const kind = event.split('\n').find(l => l.startsWith('event:'))?.slice(6).trim();
  const raw = event.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
  if (kind !== 'complete' && kind !== 'error') return null;
  const data = raw ? JSON.parse(raw) : null;
  if (kind === 'error') return { error: typeof data === 'string' ? data : data?.error || 'Free GPU quota exhausted or the public demo is unavailable. Try later, or bind your own HF_TOKEN.' };
  const url = data?.[0]?.video?.url;
  if (typeof url !== 'string') return { error: 'The LTX demo returned no video.' };
  const parsed = new URL(url);
  if (parsed.origin !== LTX_SPACE_URL || !parsed.pathname.startsWith('/gradio_api/file=')) return { error: 'The LTX demo returned an unexpected video URL.' };
  return { videoUrl: url };
}

export async function submitLtxVideo(input: Wan3GenerationInput, job: Wan3CompiledJob, apiKey: string | null): Promise<string> {
  validateLtxInput(input);
  const headers: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
  let image: unknown = null;
  if (input.startImage) {
    const match = input.startImage.dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/i);
    if (!match) throw new Error('Upload a start image as a local file for the free LTX demo.');
    const form = new FormData();
    form.append('files', new Blob([Buffer.from(match[2], 'base64')], { type: match[1] }), 'start-image');
    const uploaded = await fetch(`${LTX_SPACE_URL}/gradio_api/upload`, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(45000) });
    if (!uploaded.ok) throw new Error(`LTX image upload failed (${uploaded.status}).`);
    const paths = await uploaded.json();
    if (!Array.isArray(paths) || typeof paths[0] !== 'string') throw new Error('Invalid LTX image upload response.');
    image = { path: paths[0], meta: { _type: 'gradio.FileData' } };
  }
  const scale = input.resolution === '720p' ? 720 : 480;
  const [a, b] = (input.aspectRatio === 'auto' ? '16:9' : input.aspectRatio).split(':').map(Number);
  const width = a >= b ? Math.round(scale * a / b / 2) * 2 : scale;
  const height = a >= b ? scale : Math.round(scale * b / a / 2) * 2;
  const apiName = image ? 'image_to_video' : 'text_to_video';
  const response = await fetch(`${LTX_SPACE_URL}/gradio_api/call/${apiName}`, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [job.compiledPrompt, input.negativePrompt || '', image, null, height, width, image ? 'image-to-video' : 'text-to-video', input.duration, 9, 42, true, 1, false] }),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Free LTX demo request failed (${response.status}). Its shared GPU quota may be exhausted.`);
  const submitted = await response.json();
  if (typeof submitted.event_id !== 'string' || !/^[a-f0-9]+$/i.test(submitted.event_id)) throw new Error('The LTX demo returned an invalid job ID.');
  for (const [id, task] of tasks) if (Date.now() - task.createdAt > 2 * 60 * 60_000) tasks.delete(id);
  const taskId = `ltx-${randomUUID()}`;
  const task: LtxTask = { status: 'pending', videoUrl: null, createdAt: Date.now() };
  tasks.set(taskId, task);
  // Read the queue stream once in the background; browser polling reads our stored status.
  void (async () => {
    try {
      const result = await fetch(`${LTX_SPACE_URL}/gradio_api/call/${apiName}/${submitted.event_id}`, { headers, signal: AbortSignal.timeout(15 * 60_000) });
      if (!result.ok || !result.body) throw new Error(`LTX queue request failed (${result.status}).`);
      const reader = result.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const event = parseLtxEvent(buffer.slice(0, boundary));
          buffer = buffer.slice(boundary + 2);
          if (!event) continue;
          if (event.error) throw new Error(event.error);
          task.videoUrl = event.videoUrl!;
          task.status = 'completed';
          await reader.cancel();
          return;
        }
      }
      throw new Error('The LTX queue closed before returning a video. Retry when free GPU capacity is available.');
    } catch (error) {
      task.status = 'failed';
      task.error = error instanceof Error ? error.message : 'Free LTX generation failed.';
    }
  })();
  return taskId;
}
