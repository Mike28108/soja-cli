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
