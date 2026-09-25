import type { ThemeMode } from './theme.js';

/**
 * Chooses the light or dark palette: `SOJA_THEME`, then `COLORFGBG` (set by
 * some terminals), then asking the terminal for its background color
 * (OSC 11, answered by kitty, WezTerm, iTerm2, GNOME Terminal, Alacritty,
 * Windows Terminal…). Dark when nothing answers.
 */
export async function detectThemeMode(
  env: NodeJS.ProcessEnv = process.env,
  io: { stdin: NodeJS.ReadStream; stdout: NodeJS.WriteStream } = { stdin: process.stdin, stdout: process.stdout },
): Promise<ThemeMode> {
  const forced = env.SOJA_THEME?.toLowerCase();
  if (forced === 'light' || forced === 'dark') return forced;
  const fromEnv = modeFromColorFgBg(env.COLORFGBG);
  if (fromEnv) return fromEnv;
  const background = await queryBackground(io).catch(() => null);
  return background ?? 'dark';
}

/** `COLORFGBG="15;0"`: foreground;background as ANSI indexes (7 and 15 are light). */
export function modeFromColorFgBg(value: string | undefined): ThemeMode | null {
  const background = value?.split(';').at(-1);
  if (background === undefined || background === '' || Number.isNaN(Number(background))) return null;
  return ['7', '15'].includes(background) ? 'light' : 'dark';
}

/** `rgb:ffff/ffff/ffff` (from OSC 11) → light or dark by perceived luminance. */
export function modeFromOscReply(reply: string): ThemeMode | null {
  const match = /rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})/i.exec(reply);
  if (!match) return null;
  const [r, g, b] = match.slice(1, 4).map((hex) => Number.parseInt(hex, 16) / (16 ** hex.length - 1));
  const luminance = 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
  return luminance > 0.5 ? 'light' : 'dark';
}

function queryBackground({ stdin, stdout }: { stdin: NodeJS.ReadStream; stdout: NodeJS.WriteStream }, timeoutMs = 150): Promise<ThemeMode | null> {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    let reply = '';
    const wasRaw = stdin.isRaw;
    const finish = (result: ThemeMode | null) => {
      clearTimeout(timer);
      stdin.off('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      resolve(result);
    };
    const onData = (chunk: Buffer) => {
      reply += chunk.toString('latin1');
      const mode = modeFromOscReply(reply);
      // The reply ends with BEL or ST; a terminal that does not know OSC 11 sends nothing.
      if (mode || reply.includes('\u0007') || reply.includes('\u001b\\')) finish(mode);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    stdin.setRawMode(true);
    stdin.on('data', onData);
    stdin.resume();
    stdout.write('\x1b]11;?\x1b\\');
  });
}
