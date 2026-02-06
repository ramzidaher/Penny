import { createAvatar } from '@dicebear/core';
import { notionists } from '@dicebear/collection';

/** Seed strings for the avatar picker (signup and change avatar). Same list in both flows. */
export const AVATAR_SEEDS = Array.from({ length: 24 }, (_, i) => `avatar-${i + 1}`);

const DICEBEAR_PNG_BASE = 'https://api.dicebear.com/9.x/notionists/png';

/**
 * Returns a DiceBear API PNG URL for the given seed. Use on Android where SvgXml does not render.
 * Same seed produces the same avatar. Max size 256; we request 256 for sharp display at any size.
 */
export function getAvatarPngUrl(seed: string, pixelSize: number = 256): string {
  const size = Math.min(256, Math.max(1, Math.round(pixelSize)));
  return `${DICEBEAR_PNG_BASE}?seed=${encodeURIComponent(seed)}&size=${size}`;
}

/**
 * Generate an SVG string for an avatar using DiceBear Notionists style.
 * No API or server; runs locally. Same seed always produces the same avatar.
 * Post-processes the SVG so it renders on Android:
 * - Explicit width/height on root <svg> (required for layout on Android).
 * - Explicit fill on paths that don't have one (react-native-svg on Android doesn't apply default fill).
 */
export function getAvatarSvgString(seed: string): string {
  const avatar = createAvatar(notionists, { seed });
  let svg = avatar.toString();
  // Android: add explicit width/height to root <svg> (DiceBear only outputs viewBox).
  // Use 100x100 as the SVG's nominal size so SvgXml scales it to our display size (e.g. 56).
  // Using viewBox dimensions (1744) made the SVG render at 1744px on Android, so only the bottom-right
  // corner was visible in the small container.
  const w = '100';
  const h = '100';
  svg = svg.replace(/<svg(\s+)/, `<svg width="${w}" height="${h}"$1`);
  // Android: paths without explicit fill are invisible (react-native-svg doesn't apply default fill).
  // Add fill="#000000" to any path that has no fill attribute so they render.
  svg = svg.replace(/<path\s+([^>]*?)>/g, (_match, attrs) =>
    /\bfill\s*=/.test(attrs) ? `<path ${attrs}>` : `<path fill="#000000" ${attrs}>`
  );
  return svg;
}
