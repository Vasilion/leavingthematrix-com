/**
 * Meta descriptions get truncated by search engines around 160 characters.
 *
 * Post summaries are editorial copy — they run long on purpose, because the
 * blog index renders them in full as card excerpts. Rather than cut every
 * summary down to satisfy a SERP limit, the summary stays as written and this
 * derives a shortened variant for the meta tag only.
 *
 * A post can opt out by setting `metaDescription` in its frontmatter when the
 * truncated version reads badly.
 */
const MAX = 155;

export function metaDescription(summary: string, override?: string): string {
  if (override) return override;
  if (summary.length <= MAX) return summary;
  // Cut on a word boundary so the ellipsis doesn't land mid-word.
  const cut = summary.slice(0, MAX);
  const lastSpace = cut.lastIndexOf(' ');
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : MAX).replace(/[.,;:—-]$/, '')}…`;
}
