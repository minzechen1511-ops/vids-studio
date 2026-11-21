import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Loader2, RefreshCw, Server, Wand2 } from 'lucide-react';
import type { OpenRouterModelOption } from '../lib/openrouterModels';

interface OpenRouterPromptBoxProps {
  prompt: string;
  negativePrompt: string;
  audioCue: string;
  openrouterModel: string;
  openrouterEndpoint: string;
  freeModels: ReadonlyArray<OpenRouterModelOption>;
  freeModelsSource: 'live' | 'fallback';
  isLoadingFreeModels: boolean;
  isRefining: boolean;
  refineNotice: string | null;
  refineError: string | null;
  hasOpenRouterKey: boolean;
  onChangePrompt: (val: string) => void;
  onChangeNegativePrompt: (val: string) => void;
  onChangeAudioCue: (val: string) => void;
  onChangeOpenRouterModel: (val: string) => void;
  onChangeOpenRouterEndpoint: (val: string) => void;
  onRefreshFreeModels: () => void;
  onRefineWithOpenRouter: () => void;
}

export function OpenRouterPromptBox({
  prompt,
  negativePrompt,
  audioCue,
  openrouterModel,
  openrouterEndpoint,
  freeModels,
  freeModelsSource,
  isLoadingFreeModels,
  isRefining,
  refineNotice,
  refineError,
  hasOpenRouterKey,
  onChangePrompt,
  onChangeNegativePrompt,
  onChangeAudioCue,
  onChangeOpenRouterModel,
  onChangeOpenRouterEndpoint,
  onRefreshFreeModels,
  onRefineWithOpenRouter,
}: OpenRouterPromptBoxProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedPreset = freeModels.find((m) => m.id === openrouterModel);
  const wordCount = prompt.trim() ? prompt.trim().split(/\s+/).length : 0;

  return (
    <section aria-labelledby="prompt-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="prompt-heading" className="text-sm font-semibold text-[#F2F4F8]">
          Prompt &amp; OpenRouter Director
        </h2>
        <span className="font-mono text-xs text-[#949BA8] whitespace-nowrap shrink-0 tabular-nums">
          {wordCount} words · {prompt.length} chars
        </span>
      </div>

      {/* OpenRouter Model Selection + Direct Model ID + Endpoint Config */}
      <div className="space-y-2.5 rounded-lg border border-white/[0.08] bg-[#0E1116] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-[#D1D6E0]">OpenRouter Configuration</span>
          <span
            className={`inline-flex items-center gap-1.5 font-mono text-[11px] ${
              hasOpenRouterKey ? 'text-emerald-400' : 'text-[#E5A93C]'
            }`}
          >
            <Server className="h-3 w-3" aria-hidden="true" />
            {hasOpenRouterKey ? 'OPENROUTER_API_KEY active' : 'Set OPENROUTER_API_KEY in Secrets'}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-1">
              <label htmlFor="openrouter-preset" className="block text-[11px] text-[#949BA8]">
                Free Models ({freeModels.length})
              </label>
              <button
                type="button"
                onClick={onRefreshFreeModels}
                disabled={isLoadingFreeModels}
                aria-label="Refresh free OpenRouter models"
                title={
                  freeModelsSource === 'live'
                    ? 'Synced from live OpenRouter free catalog'
                    : 'Reload live OpenRouter free catalog'
                }
                className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] font-medium text-[#949BA8] transition-colors hover:text-[#E5A93C] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
              >
                <RefreshCw
                  className={`h-2.5 w-2.5 ${isLoadingFreeModels ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{freeModelsSource === 'live' ? 'Live' : 'Sync'}</span>
              </button>
            </div>
            <select
              id="openrouter-preset"
              value={selectedPreset ? selectedPreset.id : '__custom__'}
              onChange={(e) => {
                if (e.target.value !== '__custom__') {
                  onChangeOpenRouterModel(e.target.value);
                }
              }}
              className="w-full rounded-lg border border-white/[0.1] bg-[#12151B] px-2.5 py-2 text-xs text-[#F2F4F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
            >
              {freeModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
              {!selectedPreset && <option value="__custom__">Custom Model ID (below)</option>}
            </select>
          </div>

          <div className="space-y-1">
            <label htmlFor="openrouter-model" className="block text-[11px] text-[#949BA8]">
              OpenRouter Model ID
            </label>
            <input
              id="openrouter-model"
              type="text"
              value={openrouterModel}
              onChange={(e) => onChangeOpenRouterModel(e.target.value)}
              placeholder="e.g. google/gemma-4-31b-it:free or any model ID"
              className="w-full rounded-lg border border-white/[0.1] bg-[#12151B] px-2.5 py-2 font-mono text-xs text-[#F2F4F8] placeholder:text-[#6B7380] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="openrouter-endpoint" className="block text-[11px] text-[#949BA8]">
            LLM Refinement Endpoint (HTTPS)
          </label>
          <input
            id="openrouter-endpoint"
            type="url"
            value={openrouterEndpoint}
            onChange={(e) => onChangeOpenRouterEndpoint(e.target.value)}
            placeholder="https://openrouter.ai/api/v1/chat/completions"
            className="w-full rounded-lg border border-white/[0.1] bg-[#12151B] px-2.5 py-1.5 font-mono text-xs text-[#F2F4F8] placeholder:text-[#6B7380] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
          />
        </div>

        <p className="text-[11px] leading-relaxed text-[#949BA8]">
          {selectedPreset
            ? selectedPreset.note
            : 'Custom OpenRouter / OpenAI-compatible slug · Direct pass-through without content blocks'}
          {' · '}
          {hasOpenRouterKey ? (
            <>
              Authenticated via server <code className="font-mono text-[#D1D6E0]">OPENROUTER_API_KEY</code>{' '}
              in <strong className="font-medium text-[#D1D6E0]">Settings → Secrets</strong>.
            </>
          ) : (
            <>
              Add <code className="font-mono text-[#D1D6E0]">OPENROUTER_API_KEY</code> in{' '}
              <strong className="font-medium text-[#D1D6E0]">Settings → Secrets</strong> (local compiler runs when unset).
            </>
          )}
        </p>
      </div>

      {/* Main Prompt Textarea */}
      <div className="space-y-2">
        <label htmlFor="video-prompt" className="sr-only">
          Video Generation Prompt
        </label>
        <textarea
          id="video-prompt"
          rows={5}
          value={prompt}
          onChange={(e) => onChangePrompt(e.target.value)}
          placeholder="Describe what moves, transforms, or unfolds in your scene. No keyword restrictions or policy filters are applied to your prompt..."
          className="w-full resize-y rounded-lg border border-white/[0.1] bg-[#12151B] px-3.5 py-2.5 text-sm leading-relaxed text-[#F2F4F8] placeholder:text-[#6B7380] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
        />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={onRefineWithOpenRouter}
            disabled={isRefining || !prompt.trim()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/[0.12] bg-[#181C24] px-3.5 py-2 text-xs font-medium text-[#F2F4F8] transition-colors hover:border-[#E5A93C]/60 hover:bg-[#202631] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
          >
            {isRefining ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#E5A93C]" aria-hidden="true" />
            ) : (
              <Wand2 className="h-3.5 w-3.5 text-[#E5A93C]" aria-hidden="true" />
            )}
            <span>{isRefining ? 'Refining Prompt...' : 'Enhance with OpenRouter'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAdvanced((prev) => !prev)}
            aria-expanded={showAdvanced}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-[#949BA8] transition-colors hover:text-[#F2F4F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
          >
            <span>Audio &amp; Negative List</span>
            {showAdvanced ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        </div>

        {refineError && (
          <p role="alert" className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs text-red-200">
            {refineError}
          </p>
        )}

        {refineNotice && !refineError && (
          <p className="rounded-lg border border-white/[0.08] bg-[#12151B] px-3 py-2 text-xs text-[#D1D6E0]">
            {refineNotice}
          </p>
        )}
      </div>

      {/* Collapsible Audio & Negative Prompt */}
      {showAdvanced && (
        <div className="space-y-3 border-t border-white/[0.08] pt-3">
          <div className="space-y-1.5">
            <label htmlFor="audio-cue-input" className="block text-xs font-medium text-[#949BA8]">
              Dialogue / SFX / BGM Cue
            </label>
            <input
              id="audio-cue-input"
              type="text"
              value={audioCue}
              onChange={(e) => onChangeAudioCue(e.target.value)}
              placeholder='e.g. Rain on cobblestones, low engine idle, or Character says: "..."'
              className="w-full rounded-lg border border-white/[0.1] bg-[#12151B] px-3 py-2 text-xs text-[#F2F4F8] placeholder:text-[#6B7380] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="negative-prompt-input" className="block text-xs font-medium text-[#949BA8]">
              Negative Prompt List (In-Prompt Section)
            </label>
            <input
              id="negative-prompt-input"
              type="text"
              value={negativePrompt}
              onChange={(e) => onChangeNegativePrompt(e.target.value)}
              placeholder="e.g. warped hands, flicker, sudden jump cut"
              className="w-full rounded-lg border border-white/[0.1] bg-[#12151B] px-3 py-2 text-xs text-[#F2F4F8] placeholder:text-[#6B7380] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
            />
          </div>
        </div>
      )}
    </section>
  );
}
