import { FREE_LTX_MODEL, type ModelCatalog } from './modelRouting';
import type { Wan3GenerationInput } from './wan3';

let cached: { value: ModelCatalog; expires: number } | undefined;

export async function loadModelCatalog(): Promise<ModelCatalog> {
  if (cached && cached.expires > Date.now()) return cached.value;
  const responses = await Promise.all([
    fetch('https://openrouter.ai/api/v1/videos/models', { signal: AbortSignal.timeout(15000) }),
    fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15000) }),
  ]);
  if (responses.some(r => !r.ok)) throw new Error('Could not verify the live model catalog. Retry before generating.');
  const [videos, models] = await Promise.all(responses.map(r => r.json()));
  if (!Array.isArray(videos.data) || !Array.isArray(models.data)) throw new Error('Invalid model catalog response.');
  const videoModels = videos.data.filter((m: any) => typeof m.id === 'string').map((m: any) => ({
    id: m.id, name: m.name || m.id,
    supported_durations: m.supported_durations,
    supported_resolutions: m.supported_resolutions,
    supported_aspect_ratios: m.supported_aspect_ratios,
  }));
  const value: ModelCatalog = {
    videoModels: [FREE_LTX_MODEL, ...videoModels],
    visionModelIds: models.data.filter((m: any) => m.architecture?.input_modalities?.includes('image')).map((m: any) => m.id),
    textModelIds: models.data.filter((m: any) => m.architecture?.output_modalities?.includes('text') &&
      !videoModels.some((v: any) => v.id === m.id)).map((m: any) => m.id),
  };
  cached = { value, expires: Date.now() + 5 * 60_000 };
  return value;
}

export async function writeVideoScript(input: Wan3GenerationInput, model: string, apiKey: string, supportsVision = true): Promise<string> {
  const images = input.mediaMode === 'frames'
    ? [input.startImage, input.endImage].filter(Boolean) : input.referenceImages || [];
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'MZ Vids Studio' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Write a precise video shooting script for the renderer. Preserve the user subjects, actions, event order, dialogue, timing, and reference image roles. Do not invent unrelated scenes. Return only the script as plain text. The original user prompt remains authoritative.' },
        { role: 'user', content: [
          { type: 'text', text: `User prompt: ${input.prompt}\nDuration: ${input.duration}s\nSingle shot: ${Boolean(input.singleShot)}\nAudio: ${input.audioCue || 'none'}\nAvoid: ${input.negativePrompt || 'none'}\nReferences: ${images.map(i => `${i!.role}: ${i!.name}`).join(', ')}` },
          ...(supportsVision ? images.slice(0, 3).map(i => ({ type: 'image_url', image_url: { url: i!.dataUrl } })) : []),
        ] },
      ],
      max_tokens: 2000,
      temperature: 0.3,
    }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await response.json() as any;
  if (!response.ok) throw new Error(`Director ${model}: ${data.error?.message || `request failed (${response.status})`}`);
  const script = data.choices?.[0]?.message?.content;
  if (typeof script !== 'string' || !script.trim()) throw new Error(`Director ${model} returned no script. Video was not submitted.`);
  return script.trim();
}

// The provider's content URL requires Authorization; browsers receive our same-origin URL.
export function openRouterContentUrl(taskId: string): string {
  return `https://openrouter.ai/api/v1/videos/${encodeURIComponent(taskId)}/content`;
}
