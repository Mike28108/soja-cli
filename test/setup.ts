/**
 * Every Git process in the tests, including the ones SOJA runs itself, uses
 * a fixed identity and ignores the machine's global and system Git config.
 * Without this, tests pass on a developer's machine and fail on a clean one.
 */
Object.assign(process.env, {
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
});

/**
 * The ink-testing-library stdout reports 100 columns but no rows, so Ink falls
 * back to the size of the terminal running the tests: layouts (and assertions)
 * changed with the developer's window. A fixed size makes every run render the
 * same frames as CI.
 */
Object.assign(process.env, { COLUMNS: '100', LINES: '24' });
