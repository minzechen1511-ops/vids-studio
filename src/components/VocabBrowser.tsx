import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { CAMERA_PRESETS, STYLE_PRESETS } from '../lib/wan3';

interface VocabBrowserProps {
  selectedCameraId: string;
  selectedStyleId: string;
  onApplyCamera: (cameraId: string) => void;
  onApplyStyle: (styleId: string) => void;
}

export function VocabBrowser({
  selectedCameraId,
  selectedStyleId,
  onApplyCamera,
  onApplyStyle,
}: VocabBrowserProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('All');

  const categories = ['All', 'Static', 'Linear', 'Vertical', 'Orbit', 'Zoom', 'Follow', 'Specialty'];

  const filteredCameras = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CAMERA_PRESETS.filter((cam) => {
      const catMatch = category === 'All' || cam.category === category;
      const textMatch =
        !q ||
        cam.name.toLowerCase().includes(q) ||
        cam.description.toLowerCase().includes(q) ||
        cam.promptPhrase.toLowerCase().includes(q);
      return catMatch && textMatch;
    });
  }, [query, category]);

  const filteredStyles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return STYLE_PRESETS;
    return STYLE_PRESETS.filter(
      (st) =>
        st.name.toLowerCase().includes(q) ||
        st.lookDirective.toLowerCase().includes(q) ||
        st.colorGrade.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="mx-auto max-w-[1280px] space-y-8 px-6 py-8">
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[#F2F4F8]">
            Camera &amp; Style Vocabulary
          </h1>
          <p className="mt-1 text-sm text-[#949BA8]">
            Sourced from the cloned <code className="font-mono text-[#D1D6E0]">higgsfield-ai-prompt-skill</code> camera controls and visual look presets. Select any preset to apply it directly to your Studio shot.
          </p>
        </div>

        <div className="relative w-full md:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7380]"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Filter camera and style vocabulary"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter presets..."
            className="w-full rounded-lg border border-white/[0.1] bg-[#12151B] py-2 pl-9 pr-3 text-xs text-[#F2F4F8] placeholder:text-[#6B7380] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
          />
        </div>
      </div>

      {/* Camera Presets */}
      <section aria-labelledby="vocab-camera-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="vocab-camera-heading" className="text-base font-semibold text-[#F2F4F8]">
            Camera Movements ({filteredCameras.length})
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  category === cat
                    ? 'bg-[#E5A93C] text-[#0B0D10]'
                    : 'border border-white/[0.08] bg-[#12151B] text-[#949BA8] hover:text-[#F2F4F8]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredCameras.map((cam) => {
            const isSelected = selectedCameraId === cam.id;
            return (
              <div
                key={cam.id}
                className={`flex flex-col justify-between rounded-xl border p-4 transition-colors ${
                  isSelected
                    ? 'border-[#E5A93C] bg-[#E5A93C]/5'
                    : 'border-white/[0.08] bg-[#12151B]'
                }`}
              >
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#F2F4F8]">{cam.name}</h3>
                    <span className="font-mono text-[11px] text-[#949BA8]">{cam.category}</span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#949BA8]">
                    {cam.description}
                  </p>
                  <p className="mt-2.5 font-mono text-[11px] text-[#D1D6E0]">
                    &ldquo;{cam.promptPhrase}&rdquo;
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/[0.06] flex justify-end">
                  <button
                    type="button"
                    onClick={() => onApplyCamera(cam.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-[#E5A93C] text-[#0B0D10]'
                        : 'border border-white/[0.12] bg-[#181C24] text-[#F2F4F8] hover:border-[#E5A93C]/60'
                    }`}
                  >
                    {isSelected ? 'Selected in Studio' : 'Use in Studio'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Style Presets */}
      <section aria-labelledby="vocab-style-heading" className="space-y-4 pt-2">
        <h2 id="vocab-style-heading" className="text-base font-semibold text-[#F2F4F8]">
          Visual Look &amp; Color Grades ({filteredStyles.length})
        </h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          {filteredStyles.map((style) => {
            const isSelected = selectedStyleId === style.id;
            return (
              <div
                key={style.id}
                className={`flex flex-col justify-between rounded-xl border p-4 ${
                  isSelected
                    ? 'border-[#E5A93C] bg-[#E5A93C]/5'
                    : 'border-white/[0.08] bg-[#12151B]'
                }`}
              >
                <div>
                  <h3 className="text-sm font-semibold text-[#F2F4F8]">{style.name}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#949BA8]">
                    {style.lookDirective}
                  </p>
                  <p className="mt-2 font-mono text-[11px] text-[#D1D6E0]">{style.colorGrade}</p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/[0.06] flex justify-end">
                  <button
                    type="button"
                    onClick={() => onApplyStyle(style.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-[#E5A93C] text-[#0B0D10]'
                        : 'border border-white/[0.12] bg-[#181C24] text-[#F2F4F8] hover:border-[#E5A93C]/60'
                    }`}
                  >
                    {isSelected ? 'Selected in Studio' : 'Apply Look'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
