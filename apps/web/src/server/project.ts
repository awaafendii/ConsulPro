import type { OrgContext, ProjectView } from '@consulpro/application';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { z } from 'zod';

import { getServer } from './container';
import { requireOrganization } from './session';

const projectId = z.uuid();

/**
 * Projet de la page courante (mis en cache pour la requête : la mise en page et la page
 * le partagent). Un projet inexistant ou inaccessible donne une page 404.
 */
export const requireProject = cache(
  async (orgSlug: string, id: string): Promise<{ ctx: OrgContext; project: ProjectView }> => {
    const ctx = await requireOrganization(orgSlug);
    if (!projectId.safeParse(id).success) notFound();
    const result = await getServer().infra.app.projects.get(ctx, id);
    if (!result.ok) notFound();
    return { ctx, project: result.value };
  },
);
