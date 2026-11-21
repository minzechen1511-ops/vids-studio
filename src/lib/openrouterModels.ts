export interface OpenRouterModelOption {
  id: string;
  label: string;
  vision: boolean;
  note: string;
  contextLength?: number;
}

export interface RawOpenRouterCatalogItem {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  architecture?: {
    modality?: unknown;
    input_modalities?: unknown;
    output_modalities?: unknown;
  } | null;
  pricing?: {
    prompt?: unknown;
    completion?: unknown;
  } | null;
}

export const DEFAULT_FREE_OPENROUTER_MODELS: ReadonlyArray<OpenRouterModelOption> = [
  {
    id: 'openrouter/free',
    label: 'Free Models Router [Vision]',
    vision: true,
    note: 'OpenRouter automatic free-tier router · 200K ctx',
    contextLength: 200000,
  },
  {
    id: 'google/gemma-4-31b-it:free',
    label: 'Google: Gemma 4 31B [Vision]',
    vision: true,
    note: 'Free multimodal instruction model · 262K ctx',
    contextLength: 262144,
  },
  {
    id: 'google/gemma-4-26b-a4b-it:free',
    label: 'Google: Gemma 4 26B A4B [Vision]',
    vision: true,
    note: 'Free fast multimodal MoE · 262K ctx',
    contextLength: 262144,
  },
  {
    id: 'nvidia/nemotron-3.5-super-vl:free',
    label: 'NVIDIA: Nemotron 3.5 Super VL [Vision]',
    vision: true,
    note: 'Free vision-language director · 1M ctx',
    contextLength: 1000000,
  },
  {
    id: 'nvidia/nemotron-3-ultra-550b-a55b:free',
    label: 'NVIDIA: Nemotron 3 Ultra',
    vision: false,
    note: 'Free 550B reasoning & creative writer · 1M ctx',
    contextLength: 1000000,
  },
  {
    id: 'nvidia/nemotron-3.5-lightning:free',
    label: 'NVIDIA: Nemotron 3.5 Lightning',
    vision: false,
    note: 'Free low-latency prompt compiler · 1M ctx',
    contextLength: 1000000,
  },
  {
    id: 'inclusionai/ling-3.2-flash:free',
    label: 'inclusionAI: Ling 3.2 Flash [Vision]',
    vision: true,
    note: 'Free multimodal flash model · 1M ctx',
    contextLength: 1048576,
  },
];

function formatContextBadge(contextLength?: number): string {
  if (!contextLength || !Number.isFinite(contextLength) || contextLength <= 0) return '';
  if (contextLength >= 1_000_000) {
    const m = contextLength / 1_000_000;
    return `${Number.isInteger(m) ? m : m.toFixed(1)}M ctx`;
  }
  return `${Math.round(contextLength / 1000)}K ctx`;
}

function isZeroPrice(value: unknown): boolean {
  if (value === 0 || value === '0') return true;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return false;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed === 0;
  }
  return false;
}

export function parseFreeOpenRouterModels(rawItems: unknown): OpenRouterModelOption[] {
  if (!Array.isArray(rawItems)) return [];

  const seen = new Set<string>();
  const parsed: OpenRouterModelOption[] = [];

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;
    const row = item as RawOpenRouterCatalogItem;
    const id = typeof row.id === 'string' ? row.id.trim() : '';
    if (!id || seen.has(id)) continue;

    const pricing = row.pricing;
    const isFreeRoute =
      id === 'openrouter/free' ||
      id.endsWith(':free') ||
      (Boolean(pricing) && isZeroPrice(pricing?.prompt) && isZeroPrice(pricing?.completion));

    if (!isFreeRoute) continue;

    const arch = row.architecture;
    const outModalities = Array.isArray(arch?.output_modalities)
      ? arch.output_modalities.filter((m): m is string => typeof m === 'string')
      : [];

    // Keep text chat-completion models and exclude audio/image-only generator endpoints
    if (outModalities.length > 0) {
      const supportsText = outModalities.includes('text');
      const outputsAudioOrImageOnly = outModalities.includes('audio') || outModalities.includes('image');
      if (!supportsText || outputsAudioOrImageOnly) {
        continue;
      }
    }

    const inModalities = Array.isArray(arch?.input_modalities)
      ? arch.input_modalities.filter((m): m is string => typeof m === 'string')
      : [];
    const modalityStr = typeof arch?.modality === 'string' ? arch.modality : '';
    const vision = inModalities.includes('image') || modalityStr.includes('image');

    const rawName = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : id;
    const cleanName = rawName.replace(/\s*\(free\)\s*$/i, '').replace(/\s+/g, ' ').trim();
    const label = vision ? `${cleanName} [Vision]` : cleanName;

    const contextLength =
      typeof row.context_length === 'number' && row.context_length > 0
        ? row.context_length
        : undefined;
    const ctxText = formatContextBadge(contextLength);

    const noteParts = ['Free OpenRouter tier'];
    if (vision) noteParts.push('Vision-enabled');
    if (ctxText) noteParts.push(ctxText);

    seen.add(id);
    parsed.push({
      id,
      label,
      vision,
      note: noteParts.join(' · '),
      contextLength,
    });
  }

  parsed.sort((a, b) => {
    if (a.id === 'openrouter/free') return -1;
    if (b.id === 'openrouter/free') return 1;
    if (a.vision !== b.vision) return a.vision ? -1 : 1;
    return a.label.localeCompare(b.label);
  });

  return parsed;
}
