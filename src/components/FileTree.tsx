import React, { useEffect, useState } from "react";
import { cls } from "../lib/tokens";
import { FsEntry, homeDir, isTauri, listDir } from "../lib/tauri";
import { I } from "./Icons";

interface Props {
  dark: boolean;
  onOpenFile: (path: string, name: string) => void;
}

const FileTree: React.FC<Props> = ({ dark, onOpenFile }) => {
  const [cwd, setCwd] = useState<string>("");
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // 최초 로드 — HOME으로 시작.
  useEffect(() => {
    if (!isTauri()) return;
    homeDir().then(setCwd).catch((e) => setErr(String(e)));
  }, []);

  // cwd 변경 시 디렉토리 리스팅.
  useEffect(() => {
    if (!cwd) return;
    listDir(cwd)
      .then((e) => { setEntries(e); setErr(null); })
      .catch((e) => setErr(String(e)));
  }, [cwd]);

  const parts = cwd.split("/").filter(Boolean);
  const goTo = (idx: number) => setCwd("/" + parts.slice(0, idx + 1).join("/"));
  const goUp = () => {
    const p = cwd.split("/").filter(Boolean);
    if (p.length === 0) return;
    setCwd("/" + p.slice(0, -1).join("/"));
  };
  const goHome = () => { homeDir().then(setCwd); };

  return (
    <div className={cls("h-full flex flex-col", dark ? "bg-dbg" : "bg-cream")}>
      {/* breadcrumb */}
      <div
        className={cls(
          "h-8 px-2 flex items-center gap-1 border-b text-[11px] font-mono overflow-x-auto whitespace-nowrap",
          dark ? "border-dline text-dsub" : "border-line text-sub",
        )}
      >
        <button
          onClick={goHome}
          className={cls(
            "shrink-0 h-6 px-1.5 rounded-[4px] transition-colors",
            dark ? "hover:bg-dmuted hover:text-dink" : "hover:bg-muted hover:text-ink",
          )}
          title="홈으로"
        >
          ~
        </button>
        <button
          onClick={goUp}
          className={cls(
            "shrink-0 h-6 px-1.5 rounded-[4px] transition-colors",
            dark ? "hover:bg-dmuted hover:text-dink" : "hover:bg-muted hover:text-ink",
          )}
          title="상위 폴더"
        >
          ↑
        </button>
        <span className={cls("shrink-0 opacity-50", dark ? "text-dsub" : "text-sub")}>/</span>
        {parts.map((name, i) => (
          <React.Fragment key={`${i}-${name}`}>
            <button
              onClick={() => goTo(i)}
              className={cls(
                "shrink-0 h-6 px-1.5 rounded-[4px] truncate max-w-[160px] transition-colors",
                dark ? "hover:bg-dmuted hover:text-dink" : "hover:bg-muted hover:text-ink",
              )}
              title={name}
            >
              {name}
            </button>
            {i < parts.length - 1 && (
              <span className={cls("shrink-0 opacity-40", dark ? "text-dsub" : "text-sub")}>/</span>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* list */}
      <div className="flex-1 overflow-auto py-1">
        {err && (
          <div className={cls("px-3 py-2 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
            {err}
          </div>
        )}
        {!err && entries.length === 0 && (
          <div className={cls("px-3 py-2 text-[11.5px]", dark ? "text-dsub" : "text-sub")}>
            비어 있음
          </div>
        )}
        {entries.map((e) => (
          <button
            key={e.path}
            onClick={() => {
              if (e.is_dir) setCwd(e.path);
              else onOpenFile(e.path, e.name);
            }}
            className={cls(
              "w-full h-7 px-3 flex items-center gap-2 text-left text-[12px] transition-colors",
              dark ? "text-dink hover:bg-[#2a2a28]" : "text-ink hover:bg-muted",
            )}
            title={e.path}
          >
            <span
              className={cls(
                "shrink-0 w-4 grid place-items-center text-[11px]",
                dark ? "text-dsub" : "text-sub",
              )}
            >
              {e.is_dir ? "▸" : "·"}
            </span>
            <span className="flex-1 truncate font-mono">
              {e.name}
              {e.is_dir ? "/" : ""}
            </span>
            {!e.is_dir && (
              <span
                className={cls(
                  "shrink-0 font-mono text-[10px] tabular-nums",
                  dark ? "text-dsub" : "text-sub",
                )}
              >
                {formatSize(e.size)}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

function formatSize(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}K`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}M`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)}G`;
}

export default FileTree;
