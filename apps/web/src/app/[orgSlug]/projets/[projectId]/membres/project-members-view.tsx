'use client';

import type { OrgRoleDto, ProjectMemberDto, ProjectRoleDto } from '@consulpro/contracts';
import { PROJECT_ROLES, roleRank } from '@consulpro/domain';
import {
  Badge,
  Button,
  Callout,
  DataTable,
  EmptyState,
  Label,
  Section,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
  useConfirm,
  type DataColumn,
} from '@consulpro/ui';
import { useMutation } from '@tanstack/react-query';
import { UserMinus, UserPlus, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { api, ApiError } from '@/lib/api';

interface Candidate {
  readonly userId: string;
  readonly name: string;
  readonly email: string;
  readonly role: OrgRoleDto;
}

interface Props {
  readonly orgSlug: string;
  readonly projectId: string;
  readonly canManage: boolean;
  readonly members: readonly ProjectMemberDto[];
  readonly candidates: readonly Candidate[];
}

/** Rôles de projet attribuables à une personne : jamais au-dessus de son rôle d'organisation. */
const rolesFor = (orgRole: OrgRoleDto) =>
  PROJECT_ROLES.filter((r) => roleRank(r) >= roleRank(orgRole));

export function ProjectMembersView({ orgSlug, projectId, canManage, members, candidates }: Props) {
  const t = useTranslations('project.members');
  const tRoles = useTranslations('roles');
  const confirm = useConfirm();
  const router = useRouter();
  const base = `/organizations/${orgSlug}/projects/${projectId}/members`;

  const onError = (error: Error) => {
    toast.error(error.message);
    if (error instanceof ApiError && error.problem.status === 412) router.refresh();
  };

  const changeRole = useMutation({
    mutationFn: ({ member, role }: { member: ProjectMemberDto; role: ProjectRoleDto }) =>
      api(`${base}/${member.id}`, {
        method: 'PATCH',
        json: { role },
        headers: { 'if-match': `"${member.version}"` },
      }),
    onSuccess: (_data, { member, role }) => {
      toast.success(t('roleChanged', { name: member.name, role: tRoles(role) }));
      router.refresh();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (member: ProjectMemberDto) =>
      api(`${base}/${member.id}`, {
        method: 'DELETE',
        headers: { 'if-match': `"${member.version}"` },
      }),
    onSuccess: (_data, member) => {
      toast.success(t('removed', { name: member.name }));
      router.refresh();
    },
    onError,
  });

  const columns: DataColumn<ProjectMemberDto>[] = [
    {
      id: 'name',
      header: t('name'),
      cell: (m) => <span className="font-medium">{m.name}</span>,
      sortValue: (m) => m.name,
      filterValue: (m) => `${m.name} ${m.email}`,
    },
    { id: 'email', header: t('email'), cell: (m) => m.email, sortValue: (m) => m.email },
    {
      id: 'role',
      header: t('role'),
      sortValue: (m) => roleRank(m.role),
      cell: (m) =>
        canManage ? (
          <Select
            value={m.role}
            disabled={changeRole.isPending}
            onValueChange={(role) => {
              changeRole.mutate({ member: m, role: role as ProjectRoleDto });
            }}
          >
            <SelectTrigger size="sm" aria-label={t('roleOf', { name: m.name })} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rolesFor(m.organizationRole).map((r) => (
                <SelectItem key={r} value={r}>
                  {tRoles(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant="secondary">{tRoles(m.role)}</Badge>
        ),
    },
    { id: 'orgRole', header: t('orgRole'), cell: (m) => tRoles(m.organizationRole) },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: t('actions'),
            align: 'end' as const,
            cell: (m: ProjectMemberDto) => (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`${t('remove')} ${m.name}`}
                onClick={() => {
                  void confirm({
                    title: t('removeTitle', { name: m.name }),
                    description: t('removeDescription', { name: m.name }),
                    confirmLabel: t('remove'),
                    tone: 'destructive',
                  }).then((ok) => {
                    if (ok) remove.mutate(m);
                  });
                }}
              >
                <UserMinus aria-hidden />
                {t('remove')}
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <Callout>{t('description')}</Callout>
      <DataTable
        caption={t('table')}
        columns={columns}
        rows={members}
        getRowId={(m) => m.id}
        empty={<EmptyState icon={Users} title={t('empty')} />}
      />
      {canManage && (
        <Section title={t('addTitle')} description={t('addDescription')}>
          <AddMemberForm
            base={base}
            candidates={candidates}
            onAdded={() => {
              router.refresh();
            }}
          />
        </Section>
      )}
    </div>
  );
}

function AddMemberForm({
  base,
  candidates,
  onAdded,
}: {
  base: string;
  candidates: readonly Candidate[];
  onAdded: () => void;
}) {
  const t = useTranslations('project.members');
  const tRoles = useTranslations('roles');
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<ProjectRoleDto | ''>('');
  const candidate = candidates.find((c) => c.userId === userId);
  const roles = candidate ? rolesFor(candidate.role) : [];

  const add = useMutation({
    mutationFn: () => api(base, { method: 'POST', json: { userId, role } }),
    onSuccess: () => {
      toast.success(t('added', { name: candidate?.name ?? '' }));
      setUserId('');
      setRole('');
      onAdded();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (candidates.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('noCandidate')}</p>;
  }

  return (
    <form
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="project-member-person">{t('person')}</Label>
        <Select
          value={userId}
          onValueChange={(next) => {
            // Radix peut émettre une valeur vide quand la liste d'options change.
            if (!next) return;
            setUserId(next);
            const picked = candidates.find((c) => c.userId === next);
            setRole(picked ? (rolesFor(picked.role)[0] ?? '') : '');
          }}
        >
          <SelectTrigger id="project-member-person" className="w-full">
            <SelectValue placeholder={t('personPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {candidates.map((c) => (
              <SelectItem key={c.userId} value={c.userId}>
                {c.name} — {c.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="project-member-role">{t('role')}</Label>
        <Select
          value={role}
          disabled={!candidate}
          onValueChange={(next) => {
            if (next) setRole(next as ProjectRoleDto);
          }}
        >
          <SelectTrigger id="project-member-role" className="w-full sm:w-44">
            <SelectValue placeholder={t('personPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r} value={r}>
                {tRoles(r)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={!candidate || role === ''} loading={add.isPending}>
        <UserPlus aria-hidden />
        {add.isPending ? t('adding') : t('add')}
      </Button>
    </form>
  );
}
