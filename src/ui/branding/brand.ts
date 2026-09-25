/**
 * Single source of SOJA's identity. Plain strings only (no Ink) so the
 * non-interactive CLI can use them too.
 */
export { APP_VERSION } from '../../config/version.js';

export const APP_NAME = 'SOJA';
export const APP_DESCRIPTION = 'Software Operations & Job Assistant';
export const APP_SLOGAN = 'No dashboards. No browser. No bullshit. Just work.';
export const APP_AUTHOR = 'Enmauel.biz';
/** Where releases (and the installable package) are published. */
export const APP_REPOSITORY = 'Mike28108/soja-cli';

/**
 * The wordmark: a rounded pixel font drawn with half blocks, so every
 * terminal row carries two pixel rows and the mark stays three lines tall.
 */
export const WORDMARK: readonly string[] = [
  '▄█▀▀▀▀▀▀  ▄█▀▀▀▀█▄        ██  ▄█▀▀▀▀█▄',
  ' ▀▀▀▀▀█▄  ██    ██        ██  ██▄▄▄▄██',
  '▄▄▄▄▄▄█▀  ▀█▄▄▄▄█▀  ▀█▄▄▄▄█▀  ██    ██',
];

/** The terminal cursor that follows the wordmark. It is SOJA's signature. */
export const WORDMARK_CURSOR = '▄▄▄';

export const WORDMARK_WIDTH = Math.max(...WORDMARK.map((line) => line.length)) + 1 + WORDMARK_CURSOR.length;
