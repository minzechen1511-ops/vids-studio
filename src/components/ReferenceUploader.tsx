import React, { useRef, useState } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import {
  STARTER_REFERENCES,
  WAN3_MAX_IMAGE_REFS,
  type ReferenceAsset,
  type Wan3MediaMode,
} from '../lib/wan3';

interface ReferenceUploaderProps {
  mediaMode: Wan3MediaMode;
  supportsFrames: boolean;
  supportsReferences: boolean;
  startImage: ReferenceAsset | null;
  endImage: ReferenceAsset | null;
  referenceImages: ReferenceAsset[];
  onChangeMediaMode: (mode: Wan3MediaMode) => void;
  onSetStartImage: (asset: ReferenceAsset | null) => void;
  onSetEndImage: (asset: ReferenceAsset | null) => void;
  onAddReferenceImages: (assets: ReferenceAsset[]) => void;
  onRemoveReferenceImage: (id: string) => void;
  onApplyStarter: (starterId: string) => void;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export function ReferenceUploader({
  mediaMode,
  supportsFrames,
  supportsReferences,
  startImage,
  endImage,
  referenceImages,
  onChangeMediaMode,
  onSetStartImage,
  onSetEndImage,
  onAddReferenceImages,
  onRemoveReferenceImage,
  onApplyStarter,
}: ReferenceUploaderProps) {
  const startInputRef = useRef<HTMLInputElement>(null);
  const endInputRef = useRef<HTMLInputElement>(null);
  const refsInputRef = useRef<HTMLInputElement>(null);
  const [dragTarget, setDragTarget] = useState<'start' | 'end' | 'refs' | null>(null);
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});

  async function handleFiles(files: FileList | null, target: 'start' | 'end' | 'refs') {
    if (!files || files.length === 0) return;
    const validFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (validFiles.length === 0) return;

    if (target === 'start') {
      const dataUrl = await readFileAsDataUrl(validFiles[0]);
      onSetStartImage({
        id: `start-${Date.now()}`,
        name: validFiles[0].name,
        dataUrl,
        role: 'start_image',
      });
    } else if (target === 'end') {
      const dataUrl = await readFileAsDataUrl(validFiles[0]);
      onSetEndImage({
        id: `end-${Date.now()}`,
        name: validFiles[0].name,
        dataUrl,
        role: 'end_image',
      });
    } else {
      const remainingSlots = Math.max(0, WAN3_MAX_IMAGE_REFS - referenceImages.length);
      const selected = validFiles.slice(0, remainingSlots);
      const loaded = await Promise.all(
        selected.map(async (f, i) => ({
          id: `ref-${Date.now()}-${i}`,
          name: f.name,
          dataUrl: await readFileAsDataUrl(f),
          role: 'image_references' as const,
        }))
      );
      onAddReferenceImages(loaded);
    }
  }

  function renderThumbnail(
    asset: ReferenceAsset,
    label: string,
    removeLabel: string,
    onRemove: () => void
  ) {
    const failed = imageErrorMap[asset.id];
    return (
      <div
        key={asset.id}
        className="group relative overflow-hidden rounded-lg border border-white/[0.1] bg-[#12151B]"
      >
        {failed ? (
          <div className="flex h-28 w-full flex-col items-center justify-center bg-[#181C24] px-3 text-center">
            <ImagePlus className="mb-1 h-5 w-5 text-[#949BA8]" aria-hidden="true" />
            <span className="truncate max-w-full text-xs text-[#949BA8]">{asset.name}</span>
          </div>
        ) : (
          <img
            src={asset.dataUrl}
            alt={label}
            referrerPolicy="no-referrer"
            onError={() => setImageErrorMap((prev) => ({ ...prev, [asset.id]: true }))}
            className="h-28 w-full object-cover"
          />
        )}
        <div className="flex items-center justify-between gap-2 border-t border-white/[0.08] bg-[#12151B] px-2.5 py-1.5">
          <span className="truncate text-xs font-medium text-[#D1D6E0]">{label}</span>
          <button
            type="button"
            onClick={onRemove}
            aria-label={removeLabel}
            className="rounded p-1 text-[#949BA8] transition-colors hover:bg-white/[0.08] hover:text-[#F2F4F8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby="media-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="media-heading" className="text-sm font-semibold text-[#F2F4F8] whitespace-nowrap">
          Reference Media
        </h2>
        <div
          role="group"
          aria-label="Wan media mode"
          className="inline-flex rounded-lg border border-white/[0.08] bg-[#0B0D10] p-0.5"
        >
          {supportsFrames && (
            <button
              type="button"
              onClick={() => onChangeMediaMode('frames')}
              aria-pressed={mediaMode === 'frames'}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                mediaMode === 'frames'
                  ? 'bg-[#202631] text-[#F2F4F8]'
                  : 'text-[#949BA8] hover:text-[#F2F4F8]'
              }`}
            >
              Start / End Frames
            </button>
          )}
          {supportsReferences && (
            <button
              type="button"
              onClick={() => onChangeMediaMode('references')}
              aria-pressed={mediaMode === 'references'}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                mediaMode === 'references'
                  ? 'bg-[#202631] text-[#F2F4F8]'
                  : 'text-[#949BA8] hover:text-[#F2F4F8]'
              }`}
            >
              Reference Photos
            </button>
          )}
        </div>
      </div>

      {mediaMode === 'frames' && supportsFrames ? (
        <div className="grid grid-cols-2 gap-3">
          {/* Start Frame */}
          <div>
            <input
              ref={startInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              id="start-frame-input"
              onChange={(e) => {
                void handleFiles(e.target.files, 'start');
                e.target.value = '';
              }}
            />
            {startImage ? (
              renderThumbnail(startImage, 'Image 1 · Start', 'Remove start frame', () =>
                onSetStartImage(null)
              )
            ) : (
              <button
                type="button"
                onClick={() => startInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragTarget('start');
                }}
                onDragLeave={() => setDragTarget(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragTarget(null);
                  void handleFiles(e.dataTransfer.files, 'start');
                }}
                className={`flex h-36 w-full flex-col items-center justify-center rounded-lg border border-dashed px-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] ${
                  dragTarget === 'start'
                    ? 'border-[#E5A93C] bg-[#E5A93C]/10'
                    : 'border-white/[0.14] bg-[#12151B] hover:border-white/30'
                }`}
              >
                <Upload className="mb-2 h-4 w-4 text-[#E5A93C]" aria-hidden="true" />
                <span className="text-xs font-medium text-[#F2F4F8]">Upload Start Photo</span>
                <span className="mt-1 text-[11px] text-[#949BA8]">Image 1 · Opening frame</span>
              </button>
            )}
          </div>

          {/* End Frame */}
          <div>
            <input
              ref={endInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              id="end-frame-input"
              onChange={(e) => {
                void handleFiles(e.target.files, 'end');
                e.target.value = '';
              }}
            />
            {endImage ? (
              renderThumbnail(endImage, 'Image 2 · End', 'Remove end frame', () =>
                onSetEndImage(null)
              )
            ) : (
              <button
                type="button"
                onClick={() => endInputRef.current?.click()}
                disabled={!startImage}
                onDragOver={(e) => {
                  if (!startImage) return;
                  e.preventDefault();
                  setDragTarget('end');
                }}
                onDragLeave={() => setDragTarget(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragTarget(null);
                  if (startImage) {
                    void handleFiles(e.dataTransfer.files, 'end');
                  }
                }}
                className={`flex h-36 w-full flex-col items-center justify-center rounded-lg border border-dashed px-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] ${
                  !startImage
                    ? 'cursor-not-allowed border-white/[0.06] bg-[#0F1217] opacity-55'
                    : dragTarget === 'end'
                      ? 'border-[#E5A93C] bg-[#E5A93C]/10'
                      : 'border-white/[0.14] bg-[#12151B] hover:border-white/30'
                }`}
              >
                <ImagePlus className="mb-2 h-4 w-4 text-[#949BA8]" aria-hidden="true" />
                <span className="text-xs font-medium text-[#F2F4F8]">End Frame (Optional)</span>
                <span className="mt-1 text-[11px] text-[#949BA8]">
                  {startImage ? 'Image 2 · Closing frame' : 'Add start photo first'}
                </span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            ref={refsInputRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            id="ref-images-input"
            onChange={(e) => {
              void handleFiles(e.target.files, 'refs');
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => refsInputRef.current?.click()}
            disabled={referenceImages.length >= WAN3_MAX_IMAGE_REFS}
            onDragOver={(e) => {
              e.preventDefault();
              setDragTarget('refs');
            }}
            onDragLeave={() => setDragTarget(null)}
            onDrop={(e) => {
              e.preventDefault();
              setDragTarget(null);
              void handleFiles(e.dataTransfer.files, 'refs');
            }}
            className={`flex w-full items-center justify-center gap-2.5 rounded-lg border border-dashed px-4 py-4 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] ${
              dragTarget === 'refs'
                ? 'border-[#E5A93C] bg-[#E5A93C]/10 text-[#F2F4F8]'
                : 'border-white/[0.14] bg-[#12151B] text-[#D1D6E0] hover:border-white/30'
            }`}
          >
            <Upload className="h-4 w-4 text-[#E5A93C]" aria-hidden="true" />
            <span>
              Upload reference photos ({referenceImages.length}/{WAN3_MAX_IMAGE_REFS})
            </span>
          </button>

          {referenceImages.length > 0 && (
            <div className="grid grid-cols-2 gap-2.5">
              {referenceImages.map((img, idx) =>
                renderThumbnail(
                  img,
                  `Image ${idx + 1} · ${img.name}`,
                  `Remove Image ${idx + 1}`,
                  () => onRemoveReferenceImage(img.id)
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* Quick sample photos */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-[#949BA8]">
        <span className="whitespace-nowrap">Starter plates:</span>
        <div className="flex flex-wrap items-center gap-2">
          {STARTER_REFERENCES.map((starter) => (
            <button
              key={starter.id}
              type="button"
              onClick={() => onApplyStarter(starter.id)}
              className="rounded border border-white/[0.08] bg-[#12151B] px-2.5 py-1 text-xs text-[#D1D6E0] transition-colors hover:border-[#E5A93C]/50 hover:text-[#F2F4F8] whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
            >
              {starter.title}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
