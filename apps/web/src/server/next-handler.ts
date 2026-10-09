import { getServer } from './container';
import type { RawParams } from './http/route';

/** Branche un fichier `route.ts` de Next.js sur une route du registre. */
export function handlerFor(id: string) {
  return async (
    request: Request,
    context: { params: Promise<RawParams | undefined> },
  ): Promise<Response> => {
    const route = getServer().routes.get(id);
    if (!route) throw new Error(`Route inconnue dans le registre : ${id}`);
    return route.handle(request, await context.params);
  };
}
