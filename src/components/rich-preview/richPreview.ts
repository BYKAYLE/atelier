export type RichPreviewHint = "markdown" | "text" | "image" | "pdf" | "unsupported";

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdx"]);
const TEXT_EXTENSIONS = new Set([
  "txt", "log", "rst", "adoc", "json", "jsonc", "yaml", "yml", "toml", "xml", "csv", "tsv", "ini", "conf",
]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico"]);

export function richPreviewHintForPath(path: string): RichPreviewHint {
  const normalized = path.replace(/\\/g, "/");
  const name = normalized.split("/").pop() || normalized;
  const extension = name.includes(".") ? name.split(".").pop()?.toLowerCase() || "" : "";
  if (MARKDOWN_EXTENSIONS.has(extension)) return "markdown";
  if (TEXT_EXTENSIONS.has(extension)) return "text";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  if (extension === "pdf") return "pdf";
  return "unsupported";
}

export function supportsRichPreview(path: string): boolean {
  return richPreviewHintForPath(path) !== "unsupported";
}

export function requiresRichPreview(path: string): boolean {
  const hint = richPreviewHintForPath(path);
  return hint === "image" || hint === "pdf";
}

export function defaultsToRichPreview(path: string): boolean {
  const hint = richPreviewHintForPath(path);
  return hint === "markdown" || hint === "image" || hint === "pdf";
}

export function formatPreviewBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function decodePreviewBase64(value: string, mime: string): Blob {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}
