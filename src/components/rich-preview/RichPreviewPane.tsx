import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cls } from "../../lib/tokens";
import { AgentRichPreviewResult, agentRichPreview, isTauri } from "../../lib/tauri";
import { I } from "../Icons";
import { decodePreviewBase64, formatPreviewBytes } from "./richPreview";

interface Props {
  dark: boolean;
  language: "ko" | "en";
  rootPath: string;
  path: string;
  textOverride?: string;
  onClose?: () => void;
}

const RichPreviewPane: React.FC<Props> = ({ dark, language, rootPath, path, textOverride, onClose }) => {
  const [preview, setPreview] = useState<AgentRichPreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const copy = language === "en"
    ? {
        title: "File preview",
        retry: "Reload",
        close: "Back to editor",
        unavailable: "Rich file preview is available in the installed Atelier app.",
        truncated: "Preview is limited to the first 1 MB.",
        blockedImage: "Embedded image was not loaded",
        pdfFallback: "This PDF cannot be displayed by the system web view.",
      }
    : {
        title: "파일 미리보기",
        retry: "다시 읽기",
        close: "편집기로 돌아가기",
        unavailable: "파일 미리보기는 설치된 Atelier 앱에서 사용할 수 있습니다.",
        truncated: "첫 1MB까지만 미리 보여줍니다.",
        blockedImage: "문서 안의 이미지는 자동으로 불러오지 않습니다",
        pdfFallback: "시스템 웹뷰에서 이 PDF를 표시할 수 없습니다.",
      };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    if (!isTauri()) {
      setError(copy.unavailable);
      setLoading(false);
      return () => { cancelled = true; };
    }
    agentRichPreview(rootPath, path)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((nextError) => {
        if (!cancelled) setError(String(nextError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [copy.unavailable, path, reloadToken, rootPath]);

  const binaryUrl = useMemo(() => {
    if (!preview?.data_base64 || (preview.kind !== "image" && preview.kind !== "pdf")) return null;
    return URL.createObjectURL(decodePreviewBase64(preview.data_base64, preview.mime));
  }, [preview]);

  useEffect(() => () => {
    if (binaryUrl) URL.revokeObjectURL(binaryUrl);
  }, [binaryUrl]);

  const renderedText = textOverride ?? preview?.text ?? "";

  return (
    <section className={cls("atelier-rich-preview", dark ? "atelier-rich-preview-dark" : "atelier-rich-preview-light")}>
      <header className={cls("atelier-rich-preview-header border-b", dark ? "border-dline" : "border-line")}>
        <span className="atelier-rich-preview-title">{I.eye}{copy.title}</span>
        <span className={cls("atelier-rich-preview-path", dark ? "text-dsub" : "text-sub")} title={preview?.path || path}>
          {preview?.relative_path || path.replace(/\\/g, "/").split("/").pop()}
        </span>
        {preview && <span className={dark ? "text-dsub" : "text-sub"}>{formatPreviewBytes(preview.size_bytes)}</span>}
        <button type="button" className="atelier-rich-preview-command" onClick={() => setReloadToken((value) => value + 1)}>
          {copy.retry}
        </button>
        {onClose && (
          <button type="button" className="atelier-rich-preview-close" onClick={onClose} title={copy.close} aria-label={copy.close}>
            {I.x}
          </button>
        )}
      </header>

      <div className="atelier-rich-preview-body">
        {loading ? (
          <div className={cls("atelier-rich-preview-state", dark ? "text-dsub" : "text-sub")}>...</div>
        ) : error ? (
          <div className="atelier-rich-preview-error">{error}</div>
        ) : preview?.kind === "markdown" ? (
          <article className="atelier-rich-preview-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children, href }) => <span className="atelier-rich-preview-link" title={href}>{children}</span>,
                img: ({ alt }) => <span className="atelier-rich-preview-embedded-image">{copy.blockedImage}{alt ? `: ${alt}` : ""}</span>,
              }}
            >
              {renderedText}
            </ReactMarkdown>
          </article>
        ) : preview?.kind === "text" ? (
          <pre className="atelier-rich-preview-text">{renderedText}</pre>
        ) : preview?.kind === "image" && binaryUrl ? (
          <div className="atelier-rich-preview-image-stage">
            <img src={binaryUrl} alt={preview.name} />
          </div>
        ) : preview?.kind === "pdf" && binaryUrl ? (
          <object className="atelier-rich-preview-pdf" data={binaryUrl} type="application/pdf">
            <p>{copy.pdfFallback}</p>
          </object>
        ) : (
          <div className={cls("atelier-rich-preview-state", dark ? "text-dsub" : "text-sub")}>
            {preview?.reason || copy.unavailable}
          </div>
        )}
      </div>
      {preview?.truncated && <footer className="atelier-rich-preview-truncated">{copy.truncated}</footer>}
    </section>
  );
};

export default RichPreviewPane;
