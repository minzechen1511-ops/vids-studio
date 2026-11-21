import React, { useEffect, useState } from 'react';

interface SkillDocsPayload {
  repoName: string;
  wan26Section?: string;
  wan3Section: string;
  mcslaSection: string;
  wan3CatalogSpecs: unknown[];
  openWeightModelIds?: string[];
  unlimModelIds?: string[];
}

interface SkillDocsViewProps {
  hasOpenRouterKey: boolean;
  hasWanApiKey: boolean;
  hasLocalWanEndpoint: boolean;
}

export function SkillDocsView({
  hasOpenRouterKey,
  hasWanApiKey,
  hasLocalWanEndpoint,
}: SkillDocsViewProps) {
  const [docs, setDocs] = useState<SkillDocsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/skills/docs')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SkillDocsPayload>;
      })
      .then((data) => {
        if (!cancelled) setDocs(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load skill docs.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-[1160px] space-y-6 px-6 py-8">
      <div className="border-b border-white/[0.08] pb-5">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F2F4F8]">
          Cloned Skill Reference — Open-Weight Wan 2.6, Wan 2.7 Unlim &amp; Wan 3.0
        </h1>
        <p className="mt-1 text-sm text-[#949BA8]">
          Loaded directly from the local clone of{' '}
          <code className="font-mono text-[#D1D6E0]">OSideMedia/higgsfield-ai-prompt-skill</code>.
        </p>
      </div>

      {/* Repo Capabilities & Server Status */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-white/[0.08] bg-[#12151B] p-4">
          <div className="text-xs font-medium text-[#949BA8]">Open-Weight Model in Repo</div>
          <div className="mt-1 text-sm font-semibold text-[#E5A93C]">
            {docs?.openWeightModelIds?.length ? docs.openWeightModelIds.join(', ') : 'wan2_6'}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-[#949BA8]">
            Tagged open-weight in the catalog snapshot. Self-hostable on local GPUs via{' '}
            <code className="font-mono text-[#D1D6E0]">LOCAL_WAN_ENDPOINT</code> for unlimited, uncensored runs.
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#12151B] p-4">
          <div className="text-xs font-medium text-[#949BA8]">Higgsfield Unlim-Eligible Models</div>
          <div className="mt-1 font-mono text-xs font-semibold text-[#F2F4F8]">
            {docs?.unlimModelIds?.length ? docs.unlimModelIds.join(' · ') : 'wan2_7 · kling3_0 · seedance_2_0'}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-[#949BA8]">
            Flagged <code className="font-mono text-[#D1D6E0]">supports_unlim: true</code> in the Higgsfield API snapshot (requires paid Higgsfield Unlimited account; the skill repo itself does not bundle free GPUs).
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#12151B] p-4">
          <div className="text-xs font-medium text-[#949BA8]">Server Render &amp; LLM Proxy</div>
          <div className="mt-1 text-sm font-semibold text-[#F2F4F8]">
            {hasLocalWanEndpoint
              ? 'Local GPU + '
              : hasWanApiKey
                ? 'Cloud Endpoint + '
                : 'Browser WebM + '}
            {hasOpenRouterKey ? 'OpenRouter Live' : 'Local Skill Compiler'}
          </div>
          <div className="mt-1 text-[11px] leading-relaxed text-[#949BA8]">
            Set <code className="font-mono text-[#D1D6E0]">OPENROUTER_API_KEY</code>,{' '}
            <code className="font-mono text-[#D1D6E0]">LOCAL_WAN_ENDPOINT</code>, or{' '}
            <code className="font-mono text-[#D1D6E0]">WAN_API_KEY</code> in Secrets.
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-xs text-red-200">
          Failed to read cloned repository files: {error}
        </div>
      )}

      {docs && (
        <div className="space-y-6">
          {docs.wan26Section && (
            <section className="rounded-xl border border-white/[0.08] bg-[#12151B] p-5">
              <h2 className="text-base font-semibold text-[#F2F4F8]">
                Wan 2.6 Video (Open-Weight) Guidance
              </h2>
              <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-[#0B0D10] p-4 font-mono text-xs leading-relaxed text-[#D1D6E0]">
                {docs.wan26Section}
              </pre>
            </section>
          )}

          <section className="rounded-xl border border-white/[0.08] bg-[#12151B] p-5">
            <h2 className="text-base font-semibold text-[#F2F4F8]">
              Wan 3.0 / Wan 3.0 Prime Prompting Dialect &amp; Rules
            </h2>
            <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-[#0B0D10] p-4 font-mono text-xs leading-relaxed text-[#D1D6E0]">
              {docs.wan3Section}
            </pre>
          </section>

          <section className="rounded-xl border border-white/[0.08] bg-[#12151B] p-5">
            <h2 className="text-base font-semibold text-[#F2F4F8]">
              MCSLA Prompt Structure (Root SKILL.md)
            </h2>
            <pre className="mt-3 whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-[#0B0D10] p-4 font-mono text-xs leading-relaxed text-[#D1D6E0]">
              {docs.mcslaSection}
            </pre>
          </section>

          <section className="rounded-xl border border-white/[0.08] bg-[#12151B] p-5">
            <h2 className="text-base font-semibold text-[#F2F4F8]">
              Official Wan Catalog Schemas (wan2_6, wan2_7, wan3_0, wan3_0_prime)
            </h2>
            <pre className="mt-3 max-h-96 overflow-auto rounded-lg border border-white/[0.06] bg-[#0B0D10] p-4 font-mono text-xs leading-relaxed text-[#D1D6E0]">
              {JSON.stringify(docs.wan3CatalogSpecs, null, 2)}
            </pre>
          </section>
        </div>
      )}
    </div>
  );
}
