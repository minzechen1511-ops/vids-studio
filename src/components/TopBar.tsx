import React from 'react';

export type AppView = 'studio' | 'vocab' | 'docs';

interface TopBarProps {
  activeView: AppView;
  onNavigate: (view: AppView) => void;
  onNewShot: () => void;
}

export function TopBar({ activeView, onNavigate, onNewShot }: TopBarProps) {
  const navItems: Array<{ id: AppView; label: string }> = [
    { id: 'studio', label: 'Studio' },
    { id: 'vocab', label: 'Camera & Style Vocab' },
    { id: 'docs', label: 'Skill Reference' },
  ];

  return (
    <header className="relative md:sticky md:top-0 z-30 border-b border-white/[0.08] bg-[#0B0D10]/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 md:gap-8 px-4 sm:px-6 py-3.5">
        {/* Zone 1: Single-element Brand wordmark */}
        <a
          href="#studio"
          onClick={(e) => {
            e.preventDefault();
            onNavigate('studio');
          }}
          className="font-display text-lg font-semibold tracking-tight text-[#F2F4F8] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] rounded"
        >
          MZ Vids Studio
        </a>

        {/* Zone 2: Desktop single-line navigation links */}
        <nav aria-label="Primary" className="hidden md:flex items-center gap-6">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C] rounded ${
                  isActive
                    ? 'text-[#F2F4F8]'
                    : 'text-[#949BA8] hover:text-[#F2F4F8]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[15px] h-[2px] bg-[#E5A93C]"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onNewShot}
            className="rounded-lg border border-white/[0.12] bg-[#181C24] px-4 py-2 text-xs font-medium text-[#F2F4F8] transition-colors hover:border-white/25 hover:bg-[#202631] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E5A93C]"
          >
            New Shot
          </button>
        </div>
      </div>

      {/* Mobile navigation strip so all views are visible without horizontal clipping */}
      <nav
        aria-label="Mobile sections"
        className="flex md:hidden items-center justify-between gap-2 border-t border-white/[0.06] px-4 py-2"
      >
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              aria-current={isActive ? 'page' : undefined}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[#181C24] text-[#E5A93C]'
                  : 'text-[#949BA8] hover:text-[#F2F4F8]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
