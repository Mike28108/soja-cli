export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Short uppercase key for a project name: the first word when it is short
 * (`SPRING`, `ENROLL` from EnrollBridge), otherwise its first four letters
 * (`TASK` from Taskfeeds).
 */
export function deriveProjectKey(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  const first = (words[0] ?? 'PROJ').toUpperCase();
  return first.length <= 6 ? first : first.slice(0, 4);
}

/** Appends 2, 3, … (after `separator`) until `isTaken` is false. */
export function makeUnique(base: string, isTaken: (candidate: string) => boolean, separator = ''): string {
  if (!isTaken(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}${separator}${n}`;
    if (!isTaken(candidate)) return candidate;
  }
}
