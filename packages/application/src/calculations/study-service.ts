import { err, ok, type Result } from '@consulpro/calc-core';
import { validateStudy, type NewStudy } from '@consulpro/domain';

import type { OrgContext } from '../context';
import { fromDomain, notFound, reread, staleVersion, type AppError } from '../errors';
import type { ApplicationDeps } from '../ports';
import type { StudyRecord } from '../ports-calculations';
import { appendActivity, inProject, projectDisciplines } from '../projects/project-context';
import { auditBase } from '../scope';

const READ = { permission: 'project.read', write: false } as const;
const MANAGE = { permission: 'study.manage', write: true } as const;

export function createStudyService({ uow, ids }: Pick<ApplicationDeps, 'uow' | 'ids'>) {
  return {
    async list(ctx: OrgContext, projectId: string): Promise<Result<StudyRecord[], AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) =>
        ok(await repos.studies.list(ctx.organization.id, projectId)),
      );
    },

    async get(
      ctx: OrgContext,
      projectId: string,
      studyId: string,
    ): Promise<Result<StudyRecord, AppError>> {
      return inProject(uow, ctx, projectId, READ, async (_pctx, repos) => {
        const study = await repos.studies.findById(ctx.organization.id, projectId, studyId);
        return study ? ok(study) : err(notFound('Étude'));
      });
    },

    async create(
      ctx: OrgContext,
      projectId: string,
      input: NewStudy,
    ): Promise<Result<StudyRecord, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const valid = validateStudy(input, await projectDisciplines(repos, projectId));
        if (!valid.ok) return err(fromDomain(valid.error));
        const id = ids.next();
        await repos.studies.create({
          id,
          organizationId: ctx.organization.id,
          projectId,
          discipline: valid.value.discipline,
          title: valid.value.title,
          description: valid.value.description ?? null,
          createdById: ctx.actor.userId,
        });
        await appendActivity(
          repos,
          pctx,
          'study.created',
          { title: valid.value.title, discipline: valid.value.discipline },
          { type: 'study', id },
        );
        await repos.audit.append({
          ...auditBase(ctx, ctx.organization.id),
          action: 'study.created',
          targetType: 'study',
          targetId: id,
          metadata: { projectId, title: valid.value.title, discipline: valid.value.discipline },
        });
        return ok(
          reread(await repos.studies.findById(ctx.organization.id, projectId, id), 'Étude'),
        );
      });
    },

    async update(
      ctx: OrgContext,
      projectId: string,
      studyId: string,
      input: { title: string; description?: string | undefined },
      expectedVersion: number,
    ): Promise<Result<StudyRecord, AppError>> {
      return inProject(uow, ctx, projectId, MANAGE, async (pctx, repos) => {
        const study = await repos.studies.findById(ctx.organization.id, projectId, studyId);
        if (!study) return err(notFound('Étude'));
        if (study.version !== expectedVersion) return err(staleVersion());
        const valid = validateStudy({ ...input, discipline: study.discipline }, [study.discipline]);
        if (!valid.ok) return err(fromDomain(valid.error));
        const fields = { title: valid.value.title, description: valid.value.description ?? null };
        if (
          !(await repos.studies.update(
            ctx.organization.id,
            projectId,
            studyId,
            fields,
            expectedVersion,
          ))
        ) {
          return err(staleVersion());
        }
        await appendActivity(
          repos,
          pctx,
          'study.updated',
          { title: fields.title },
          {
            type: 'study',
            id: studyId,
          },
        );
        return ok({ ...study, ...fields, version: expectedVersion + 1 });
      });
    },
  };
}

export type StudyService = ReturnType<typeof createStudyService>;
