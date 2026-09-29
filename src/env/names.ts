/** Shared variable names: UPPER_SNAKE_CASE (see soja-backend docs/ENV.md). */
export const VARIABLE_NAME = /^[A-Z_][A-Z0-9_]{0,127}$/;

/** Names that make programs load someone else's code; never handed to a program. */
const BLOCKED = /^(PATH|LD_PRELOAD|LD_LIBRARY_PATH|LD_AUDIT|NODE_OPTIONS|NODE_PATH|BASH_ENV|ENV|PROMPT_COMMAND|PYTHONSTARTUP|PYTHONPATH|PERL5OPT|PERL5LIB|RUBYOPT|RUBYLIB|JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|GIT_SSH_COMMAND|GIT_EXEC_PATH|SHELL|HOME|IFS|DYLD_.*|SOJA_.*)$/;

export function isAllowedVariable(name: string): boolean {
  return VARIABLE_NAME.test(name) && !BLOCKED.test(name);
}
