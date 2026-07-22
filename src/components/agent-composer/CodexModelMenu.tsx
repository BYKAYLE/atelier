import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cls } from "../../lib/tokens";
import type { ComposerMenuOption } from "../ComposerSelectMenu";
import { I } from "../Icons";

type MenuPanel = "root" | "model" | "speed";

type LocalizedOption = {
  value: string;
  ko: string;
  en: string;
};

type CodexModelMenuProps = {
  dark: boolean;
  language: "ko" | "en";
  disabled: boolean;
  contextKey: string;
  title: string;
  modelLabel: string;
  reasoningLabel: string;
  speedLabel: string;
  toolbarLabel: string;
  modelValue: string;
  modelOptions: readonly ComposerMenuOption[];
  effortValue: string;
  effortOptions: readonly LocalizedOption[];
  speedValue: string;
  speedOptions: readonly LocalizedOption[];
  onOpen?: () => void;
  onModelChange: (value: string) => void;
  onEffortChange: (value: string) => void;
  onSpeedChange: (value: string) => void;
};

const CodexModelMenu: React.FC<CodexModelMenuProps> = ({
  dark,
  language,
  disabled,
  contextKey,
  title,
  modelLabel,
  reasoningLabel,
  speedLabel,
  toolbarLabel,
  modelValue,
  modelOptions,
  effortValue,
  effortOptions,
  speedValue,
  speedOptions,
  onOpen,
  onModelChange,
  onEffortChange,
  onSpeedChange,
}) => {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<MenuPanel>("root");
  const [position, setPosition] = useState<React.CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const menuItems = () => Array.from(
    popoverRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[role="menuitem"]:not(:disabled), button[role="menuitemradio"]:not(:disabled)',
    ) || [],
  );

  const close = (refocus = false) => {
    setOpen(false);
    setPanel("root");
    if (refocus) window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    close();
  }, [contextKey]);

  useEffect(() => {
    if (!disabled) return;
    close();
  }, [disabled]);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && (rootRef.current?.contains(target) || popoverRef.current?.contains(target))) return;
      close();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const viewportPadding = 12;
      const gap = 8;
      const width = Math.min(292, Math.max(220, window.innerWidth - viewportPadding * 2));
      const left = Math.min(
        Math.max(viewportPadding, rect.right - width),
        Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
      );
      const availableAbove = Math.max(0, rect.top - gap - viewportPadding);
      const availableBelow = Math.max(0, window.innerHeight - rect.bottom - gap - viewportPadding);
      const openAbove = availableAbove >= 220 || availableAbove >= availableBelow;
      const available = openAbove ? availableAbove : availableBelow;

      setPosition({
        left,
        width,
        maxHeight: Math.min(480, Math.max(96, available)),
        ...(openAbove
          ? { bottom: window.innerHeight - rect.top + gap }
          : { top: rect.bottom + gap }),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      popoverRef.current?.scrollTo({ top: 0, behavior: "auto" });
      const items = menuItems();
      const selectedItem = items.find((item) => item.getAttribute("aria-checked") === "true");
      (selectedItem || items[0])?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, panel]);

  return (
    <div ref={rootRef} className="atelier-model-menu relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (disabled) return;
          setOpen((current) => {
            const next = !current;
            if (next) onOpen?.();
            if (!next) setPanel("root");
            return next;
          });
        }}
        onKeyDown={(event) => {
          if (disabled || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
          event.preventDefault();
          if (!open) {
            setOpen(true);
            setPanel("root");
            onOpen?.();
          }
        }}
        disabled={disabled}
        className={cls(
          "atelier-model-trigger h-8 min-w-[134px] max-w-[190px] rounded-[7px] border px-2.5 text-[11px] font-mono outline-none flex items-center justify-between gap-2 focus-visible:ring-2 focus-visible:ring-orange-500/70 focus-visible:ring-offset-1",
          dark
            ? "bg-dsurf border-dline text-dink disabled:text-dsub"
            : "bg-surface border-line text-ink disabled:text-sub",
        )}
        aria-label={modelLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
      >
        <span className="truncate">{toolbarLabel}</span>
        <span className={cls("shrink-0 transition-transform", open ? "rotate-180" : "")}>{I.chevron}</span>
      </button>
      {open && position && createPortal(
        <div
          ref={popoverRef}
          style={position}
          className={cls(
            "fixed z-[200] overflow-y-auto overscroll-contain rounded-[16px] border p-2 shadow-[0_16px_44px_rgba(0,0,0,0.34)]",
            dark
              ? "bg-[#2c2c2b]/95 border-[#444442] text-dink backdrop-blur"
              : "bg-[#f1efea]/95 border-[#d4d0c7] text-ink backdrop-blur",
          )}
          role="menu"
          data-testid="codex-model-menu"
          onKeyDown={(event) => {
            const items = menuItems();
            if (!items.length) return;
            const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
            let nextIndex: number | null = null;
            if (event.key === "ArrowDown") nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
            if (event.key === "ArrowUp") nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
            if (event.key === "Home") nextIndex = 0;
            if (event.key === "End") nextIndex = items.length - 1;
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close(true);
              return;
            }
            if (nextIndex === null) return;
            event.preventDefault();
            items[nextIndex]?.focus();
          }}
        >
          {panel === "root" && (
            <>
              <div className={cls("px-3 pt-1 pb-2 text-[11px]", dark ? "text-dsub" : "text-sub")}>
                {reasoningLabel}
              </div>
              {effortOptions.map((option) => {
                const selected = effortValue === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onEffortChange(option.value)}
                    className={cls(
                      "h-9 w-full rounded-[10px] px-3 flex items-center justify-between text-[11px] text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-500/70",
                      selected
                        ? dark ? "bg-[#444442] text-dink" : "bg-[#dedbd3] text-ink"
                        : dark ? "hover:bg-[#393937]" : "hover:bg-[#e4e1da]",
                    )}
                    role="menuitemradio"
                    aria-checked={selected}
                  >
                    <span>{language === "en" ? option.en : option.ko}</span>
                    {selected && <span className="text-[15px] leading-none">✓</span>}
                  </button>
                );
              })}
              <div className={cls("my-2 border-t", dark ? "border-[#444442]" : "border-[#d8d4cc]")} />
              <button
                type="button"
                onClick={() => setPanel("model")}
                className={cls(
                  "h-9 w-full rounded-[10px] px-3 flex items-center justify-between gap-3 text-[11px] text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-500/70",
                  dark ? "hover:bg-[#393937]" : "hover:bg-[#e4e1da]",
                )}
                role="menuitem"
              >
                <span className="truncate">{modelOptions.find((option) => option.value === modelValue)?.label || modelValue}</span>
                <span className={cls("text-[16px]", dark ? "text-dsub" : "text-sub")}>›</span>
              </button>
              <button
                type="button"
                onClick={() => setPanel("speed")}
                className={cls(
                  "h-9 w-full rounded-[10px] px-3 flex items-center justify-between gap-3 text-[11px] text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-500/70",
                  dark ? "hover:bg-[#393937]" : "hover:bg-[#e4e1da]",
                )}
                role="menuitem"
              >
                <span>{speedLabel}</span>
                <span className={cls("text-[16px]", dark ? "text-dsub" : "text-sub")}>›</span>
              </button>
            </>
          )}
          {panel === "model" && (
            <>
              <button
                type="button"
                onClick={() => setPanel("root")}
                className={cls(
                  "h-8 w-full rounded-[9px] px-3 flex items-center gap-2 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-orange-500/70",
                  dark ? "text-dsub hover:bg-[#393937]" : "text-sub hover:bg-[#e4e1da]",
                )}
                role="menuitem"
              >
                <span className="text-[14px]">‹</span>
                <span>{modelLabel}</span>
              </button>
              <div className={cls("my-1 border-t", dark ? "border-[#444442]" : "border-[#d8d4cc]")} />
              {modelOptions.map((option) => {
                const selected = modelValue === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      if (option.disabled) return;
                      onModelChange(option.value);
                      setPanel("root");
                    }}
                    className={cls(
                      "h-9 w-full rounded-[10px] px-3 flex items-center justify-between gap-3 text-[11px] text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-500/70",
                      option.disabled
                        ? dark ? "text-dsub/60 cursor-not-allowed" : "text-sub/60 cursor-not-allowed"
                        : selected
                          ? dark ? "bg-[#444442] text-dink" : "bg-[#dedbd3] text-ink"
                          : dark ? "hover:bg-[#393937]" : "hover:bg-[#e4e1da]",
                    )}
                    disabled={option.disabled}
                    role="menuitemradio"
                    aria-checked={selected}
                  >
                    <span className="truncate">{option.label}</span>
                    {selected && <span className="text-[15px] leading-none">✓</span>}
                  </button>
                );
              })}
            </>
          )}
          {panel === "speed" && (
            <>
              <button
                type="button"
                onClick={() => setPanel("root")}
                className={cls(
                  "h-8 w-full rounded-[9px] px-3 flex items-center gap-2 text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-orange-500/70",
                  dark ? "text-dsub hover:bg-[#393937]" : "text-sub hover:bg-[#e4e1da]",
                )}
                role="menuitem"
              >
                <span className="text-[14px]">‹</span>
                <span>{speedLabel}</span>
              </button>
              <div className={cls("my-1 border-t", dark ? "border-[#444442]" : "border-[#d8d4cc]")} />
              {speedOptions.map((option) => {
                const selected = speedValue === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      onSpeedChange(option.value);
                      setPanel("root");
                    }}
                    className={cls(
                      "h-9 w-full rounded-[10px] px-3 flex items-center justify-between text-[11px] text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-500/70",
                      selected
                        ? dark ? "bg-[#444442] text-dink" : "bg-[#dedbd3] text-ink"
                        : dark ? "hover:bg-[#393937]" : "hover:bg-[#e4e1da]",
                    )}
                    role="menuitemradio"
                    aria-checked={selected}
                  >
                    <span>{language === "en" ? option.en : option.ko}</span>
                    {selected && <span className="text-[15px] leading-none">✓</span>}
                  </button>
                );
              })}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default CodexModelMenu;
