import type { TaskFilter } from '../../application/filters.js';

export type Route =
  | { name: 'home'; filter?: TaskFilter }
  | { name: 'task'; ref: string }
  | { name: 'projects' }
  | { name: 'project'; projectId: string }
  | { name: 'workspaces' }
  | { name: 'chat'; channel?: string }
  | { name: 'help' };

export type NavigationAction = { type: 'push'; route: Route } | { type: 'pop' } | { type: 'reset'; route?: Route };

const HOME: Route = { name: 'home' };

function sameRoute(a: Route | undefined, b: Route): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A stack of screens. Home is always at the bottom; you cannot pop past it. */
export function navigate(stack: readonly Route[], action: NavigationAction): Route[] {
  switch (action.type) {
    case 'push':
      return sameRoute(stack.at(-1), action.route) ? [...stack] : [...stack, action.route];
    case 'pop':
      return stack.length > 1 ? stack.slice(0, -1) : [...stack];
    case 'reset':
      if (!action.route) return [HOME];
      return action.route.name === 'home' ? [action.route] : [HOME, action.route];
  }
}
