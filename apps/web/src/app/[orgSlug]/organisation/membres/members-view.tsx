'use client';

import type { InvitationDto, MemberDto, OrgRoleDto } from '@consulpro/contracts';
import { ORG_ROLES } from '@consulpro/domain';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
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
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, UserMinus, Users } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

/** Rôles attribuables : OWNER ne s'obtient que par transfert de propriété. */
const ASSIGNABLE = ORG_ROLES.filter((r) => r !== 'OWNER');

interface Props {
  readonly orgSlug: string;
  readonly currentUserId: string;
  readonly canManage: boolean;
  readonly initialMembers: readonly MemberDto[];
  readonly initialInvitations: readonly InvitationDto[];
}

export function MembersView({
  orgSlug,
  currentUserId,
  canManage,
  initialMembers,
  initialInvitations,
}: Props) {
  const t = useTranslations('members');
  const tRoles = useTranslations('roles');
  const format = useFormatter();
  const formatDate = (iso: string) => format.dateTime(new Date(iso), { dateStyle: 'medium' });
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const base = `/organizations/${orgSlug}`;

  const members = useQuery({
    queryKey: queryKeys.members(orgSlug),
    queryFn: () => api<{ items: MemberDto[] }>(`${base}/members`).then((r) => r.items),
    initialData: [...initialMembers],
  });
  const invitations = useQuery({
    queryKey: queryKeys.invitations(orgSlug),
    queryFn: () => api<{ items: InvitationDto[] }>(`${base}/invitations`).then((r) => r.items),
    initialData: [...initialInvitations],
    enabled: canManage,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['organization', orgSlug] });
  };
  const onError = (error: Error) => {
    toast.error(error.message);
    // Une version périmée (412) signifie que la liste affichée n'est plus à jour.
    if (error instanceof ApiError && error.problem.status === 412) refresh();
  };

  const changeRole = useMutation({
    mutationFn: ({ member, role }: { member: MemberDto; role: OrgRoleDto }) =>
      api(`${base}/members/${member.id}`, {
        method: 'PATCH',
        json: { role },
        headers: { 'if-match': `"${member.version}"` },
      }),
    onSuccess: (_data, { member, role }) => {
      toast.success(t('roleChanged', { name: member.name, role: tRoles(role) }));
      refresh();
    },
    onError,
  });

  const remove = useMutation({
    mutationFn: (member: MemberDto) =>
      api(`${base}/members/${member.id}`, {
        method: 'DELETE',
        headers: { 'if-match': `"${member.version}"` },
      }),
    onSuccess: (_data, member) => {
      toast.success(t('removed', { name: member.name }));
      refresh();
    },
    onError,
  });

  const revoke = useMutation({
    mutationFn: (invitation: InvitationDto) =>
      api(`${base}/invitations/${invitation.id}/revoke`, { method: 'POST' }),
    onSuccess: (_data, invitation) => {
      toast.success(t('revoked', { email: invitation.email }));
      refresh();
    },
    onError,
  });

  const editable = (m: MemberDto) => canManage && m.role !== 'OWNER' && m.userId !== currentUserId;

  const memberColumns: DataColumn<MemberDto>[] = [
    {
      id: 'name',
      header: t('name'),
      cell: (m) => (
        <span className="font-medium">
          {m.name}
          {m.userId === currentUserId && (
            <span className="ml-1 text-muted-foreground">({t('you')})</span>
          )}
        </span>
      ),
      sortValue: (m) => m.name,
      filterValue: (m) => `${m.name} ${m.email}`,
    },
    { id: 'email', header: t('email'), cell: (m) => m.email, sortValue: (m) => m.email },
    {
      id: 'role',
      header: t('role'),
      sortValue: (m) => ORG_ROLES.indexOf(m.role),
      cell: (m) =>
        editable(m) ? (
          <Select
            value={m.role}
            disabled={changeRole.isPending}
            onValueChange={(role) => {
              changeRole.mutate({ member: m, role: role as OrgRoleDto });
            }}
          >
            <SelectTrigger size="sm" aria-label={t('roleOf', { name: m.name })} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSIGNABLE.map((r) => (
                <SelectItem key={r} value={r}>
                  {tRoles(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Badge variant={m.role === 'OWNER' ? 'default' : 'secondary'}>{tRoles(m.role)}</Badge>
        ),
    },
    {
      id: 'since',
      header: t('since'),
      cell: (m) => formatDate(m.createdAt),
      sortValue: (m) => m.createdAt,
    },
    ...(canManage
      ? [
          {
            id: 'actions',
            header: t('actions'),
            align: 'end' as const,
            cell: (m: MemberDto) =>
              editable(m) ? (
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
              ) : null,
          },
        ]
      : []),
  ];

  const invitationColumns: DataColumn<InvitationDto>[] = [
    { id: 'email', header: t('email'), cell: (i) => i.email, sortValue: (i) => i.email },
    {
      id: 'role',
      header: t('role'),
      cell: (i) => <Badge variant="secondary">{tRoles(i.role)}</Badge>,
    },
    {
      id: 'expires',
      header: t('expires'),
      cell: (i) => formatDate(i.expiresAt),
      sortValue: (i) => i.expiresAt,
    },
    {
      id: 'actions',
      header: t('actions'),
      align: 'end',
      cell: (i) => (
        <Button
          variant="ghost"
          size="sm"
          aria-label={`${t('revoke')} ${i.email}`}
          onClick={() => {
            void confirm({
              title: t('revokeTitle', { email: i.email }),
              description: t('revokeDescription'),
              confirmLabel: t('revoke'),
              tone: 'destructive',
            }).then((ok) => {
              if (ok) revoke.mutate(i);
            });
          }}
        >
          {t('revoke')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <DataTable
        caption={t('table')}
        columns={memberColumns}
        rows={members.data}
        getRowId={(m) => m.id}
        filterPlaceholder={t('filter')}
        empty={<EmptyState icon={Users} title={t('table')} />}
      />

      {canManage && (
        <>
          <Section title={t('inviteTitle')} description={t('inviteDescription')}>
            <InviteForm orgSlug={orgSlug} onInvited={refresh} />
          </Section>
          <Section title={t('pendingTitle')}>
            <DataTable
              caption={t('pendingTable')}
              columns={invitationColumns}
              rows={invitations.data}
              getRowId={(i) => i.id}
              status={invitations.isError ? 'error' : 'ready'}
              error={{
                message: invitations.error?.message ?? '',
                onRetry: () => void invitations.refetch(),
              }}
              empty={<EmptyState icon={MailPlus} title={t('pendingEmpty')} />}
            />
          </Section>
        </>
      )}
    </div>
  );
}

function InviteForm({ orgSlug, onInvited }: { orgSlug: string; onInvited: () => void }) {
  const t = useTranslations('members');
  const tRoles = useTranslations('roles');
  const tAuth = useTranslations('auth');
  const schema = useMemo(
    () =>
      z.object({
        email: z.email(tAuth('validation.email')),
        role: z.enum(ASSIGNABLE as [OrgRoleDto, ...OrgRoleDto[]]),
      }),
    [tAuth],
  );
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', role: 'ENGINEER' },
  });
  const invite = useMutation({
    mutationFn: (values: z.infer<typeof schema>) =>
      api<InvitationDto>(`/organizations/${orgSlug}/invitations`, { method: 'POST', json: values }),
    onSuccess: (invitation) => {
      toast.success(t('invited', { email: invitation.email }));
      form.reset({ email: '', role: form.getValues('role') });
      onInvited();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={(e) =>
          void form.handleSubmit((values) => {
            invite.mutate(values);
          })(e)
        }
        className="flex flex-col gap-4 sm:flex-row sm:items-start"
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>{t('inviteEmail')}</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="off" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('inviteRole')}</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ASSIGNABLE.map((r) => (
                    <SelectItem key={r} value={r}>
                      {tRoles(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="sm:mt-[1.375rem]" loading={invite.isPending}>
          <MailPlus aria-hidden />
          {invite.isPending ? t('inviting') : t('invite')}
        </Button>
      </form>
    </Form>
  );
}
