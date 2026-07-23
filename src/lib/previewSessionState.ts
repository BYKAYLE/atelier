export function resolvePreviewVisibilityFallback(
  previewVisible: string | null | undefined,
  devScreenVisible: string | null | undefined,
): boolean {
  if (previewVisible !== null && previewVisible !== undefined) {
    return previewVisible === "1";
  }
  return devScreenVisible === "1";
}
