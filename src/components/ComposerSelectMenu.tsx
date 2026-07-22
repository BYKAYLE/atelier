import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cls } from "../lib/tokens";
import { I } from "./Icons";

export type ComposerMenuOption = {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  title?: string;
};

type ComposerSelectMenuProps = {
  dark: boolean;
  value: string;
  options: readonly ComposerMenuOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  ariaLabel: string;
  title?: string;
  triggerClassName: string;
  menuWidth?: number;
  onOpen?: () => void;
  testId?: string;
};

const ComposerSelectMenu: React.FC<ComposerSelectMenuProps> = ({
  dark,
  value,
  options,
  onChange,
  disabled = false,
  ariaLabel,
  title,
  triggerClassName,
  menuWidth = 220,
  onOpen,
  testId,
}) => {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<React.CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value) || options[0];

  const menuItems = () => Array.from(
    popoverRef.current?.querySelectorAll<HTMLButtonElement>(
      'button[role="menuitem"]:not(:disabled), button[role="menuitemradio"]:not(:disabled)',
    ) || [],
  );

  const closeAndRefocus = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && (triggerRef.current?.contains(target) || popoverRef.current?.contains(target))) return;
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAndRefocus();
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
      const padding = 12;
      const gap = 8;
      const viewportWidth = Math.max(120, window.innerWidth - padding * 2);
      const width = Math.min(Math.max(rect.width, menuWidth), viewportWidth);
      const left = Math.min(
        Math.max(padding, rect.right - width),
        Math.max(padding, window.innerWidth - width - padding),
      );
      const above = Math.max(0, rect.top - gap - padding);
      const below = Math.max(0, window.innerHeight - rect.bottom - gap - padding);
      const openAbove = above >= 160 || above >= below;
      const available = openAbove ? above : below;
      setPosition({
        left,
        width,
        maxHeight: Math.min(360, Math.max(96, available)),
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
  }, [menuWidth, open]);

  useEffect(() => {
    if (!open || !position) return;
    const frame = window.requestAnimationFrame(() => {
      const items = menuItems();
      const selectedItem = items.find((item) => item.getAttribute("aria-checked") === "true");
      (selectedItem || items[0])?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, position]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (disabled) return;
          setOpen((current) => {
            const next = !current;
            if (next) onOpen?.();
            return next;
          });
        }}
        onKeyDown={(event) => {
          if (disabled || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
          event.preventDefault();
          if (!open) {
            setOpen(true);
            onOpen?.();
          }
        }}
        disabled={disabled}
        className={cls(
          triggerClassName,
          "focus-visible:ring-2 focus-visible:ring-orange-500/70 focus-visible:ring-offset-1",
          dark
            ? "bg-dsurf border-dline text-dink disabled:text-dsub"
            : "bg-surface border-line text-ink disabled:text-sub",
        )}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title || ariaLabel}
      >
        {selected?.icon && <span className="shrink-0 opacity-80">{selected.icon}</span>}
        <span className="min-w-0 flex-1 truncate text-left">{selected?.label || value}</span>
        <span className={cls("shrink-0 transition-transform", open ? "rotate-180" : "")}>{I.chevron}</span>
      </button>
      {open && position && createPortal(
        <div
          ref={popoverRef}
          style={position}
          className={cls(
            "fixed z-[220] overflow-y-auto overscroll-contain rounded-[14px] border p-2 text-[11px] shadow-[0_16px_44px_rgba(0,0,0,0.34)]",
            dark
              ? "bg-[#2c2c2b]/95 border-[#444442] text-dink backdrop-blur"
              : "bg-[#f1efea]/95 border-[#d4d0c7] text-ink backdrop-blur",
          )}
          role="menu"
          data-testid={testId}
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
              closeAndRefocus();
              return;
            }
            if (nextIndex === null) return;
            event.preventDefault();
            items[nextIndex]?.focus();
          }}
        >
          {options.map((option) => {
            const optionSelected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  closeAndRefocus();
                }}
                disabled={option.disabled}
                className={cls(
                  "h-9 w-full rounded-[10px] px-3 flex items-center gap-2.5 text-[11px] text-left outline-none focus-visible:ring-2 focus-visible:ring-orange-500/70",
                  option.disabled
                    ? dark ? "text-dsub/60 cursor-not-allowed" : "text-sub/60 cursor-not-allowed"
                    : optionSelected
                      ? dark ? "bg-[#444442] text-dink" : "bg-[#dedbd3] text-ink"
                      : dark ? "hover:bg-[#393937]" : "hover:bg-[#e4e1da]",
                )}
                role="menuitemradio"
                aria-checked={optionSelected}
                title={option.title}
              >
                {option.icon && <span className="shrink-0 opacity-85">{option.icon}</span>}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {optionSelected && <span className="shrink-0 text-[15px] leading-none">✓</span>}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default ComposerSelectMenu;
