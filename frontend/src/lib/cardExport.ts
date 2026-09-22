import { toPng } from "html-to-image";

type CardExportOptions = {
  width: number;
  height: number;
  /** Slug for the downloaded filename, e.g. "aditi-global" */
  slug: string;
  /** Filename prefix, defaults to "chatscope" */
  prefix?: string;
};

/**
 * Export a DOM card as a PNG download. The card node must be rendered at
 * its full layout size (the caller hides it off-screen on a WRAPPER,
 * html-to-image preserves the node's own position in the clone, so an
 * off-screen-positioned node exports blank).
 *
 * Two passes: the first warms up font/image embedding, the second is the
 * export. If font embedding fails (e.g. the stylesheet can't be fetched),
 * retries once with skipFonts so the user still gets an image.
 */
export async function downloadNodeAsPng(
  node: HTMLElement,
  { width, height, slug, prefix = "chatscope" }: CardExportOptions
): Promise<void> {
  const options = { width, height, pixelRatio: 1, cacheBust: true } as const;

  const save = (dataUrl: string) => {
    const link = document.createElement("a");
    link.download = `${prefix}-${slug}.png`;
    link.href = dataUrl;
    link.click();
  };

  // Warm-up pass, then the real export
  await toPng(node, options);
  try {
    save(await toPng(node, options));
  } catch {
    save(await toPng(node, { ...options, skipFonts: true }));
  }
}
