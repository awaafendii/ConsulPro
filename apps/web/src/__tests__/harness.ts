/**
 * Banc d'essai de l'API : vrais services, vraie base (Testcontainers), vraie
 * authentification. Les routes du registre sont appelées avec de vraies `Request`.
 */
import type { OrgRole } from '@consulpro/domain';
import { createInfrastructure, MemoryMailer, type Infrastructure } from '@consulpro/infrastructure';
import { adminQuery, unique } from '@consulpro/test-utils';
import { pino } from 'pino';
import { inject } from 'vitest';

import type { RouteDefinition } from '../server/http/route';
import { createRoutes } from '../server/http/routes';

export const APP_URL = 'http://localhost:3000';
const PASSWORD = 'Mot-de-passe-solide-2026';

export interface Actor {
  readonly email: string;
  readonly userId: string;
  readonly cookie: string;
}

export interface CallOptions {
  readonly actor?: Actor | null;
  readonly params?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly rawBody?: string;
  readonly query?: Readonly<Record<string, string>>;
  readonly headers?: Readonly<Record<string, string>>;
  /** `null` : aucun en-tête Origin. */
  readonly origin?: string | null;
}

export class Harness {
  readonly mailer = new MemoryMailer();
  readonly infra: Infrastructure;
  readonly routes: ReadonlyMap<string, RouteDefinition>;

  constructor() {
    this.infra = createInfrastructure({
      databaseUrl: inject('database').appUrl,
      appUrl: APP_URL,
      authSecret: 'y'.repeat(48),
      mailer: this.mailer,
      rateLimit: false,
      demoEngines: true,
    });
    const routes = createRoutes({
      app: this.infra.app,
      auth: this.infra.auth,
      appUrl: APP_URL,
      logger: pino({ level: 'silent' }),
    });
    this.routes = new Map(routes.map((r) => [r.id, r]));
  }

  route(id: string): RouteDefinition {
    const route = this.routes.get(id);
    if (!route) throw new Error(`route inconnue : ${id}`);
    return route;
  }

  /** Appelle une route du registre comme le ferait Next.js. */
  async call(id: string, options: CallOptions = {}): Promise<Response> {
    const route = this.route(id);
    const params = options.params ?? {};
    const path = route.path.replace(/:(\w+)/g, (_, name: string) =>
      encodeURIComponent(params[name] ?? `missing-${name}`),
    );
    const url = new URL(path, APP_URL);
    for (const [key, value] of Object.entries(options.query ?? {}))
      url.searchParams.set(key, value);
    const headers: Record<string, string> = { 'user-agent': 'vitest', ...options.headers };
    if (options.origin !== null) headers.origin = options.origin ?? APP_URL;
    if (options.actor) headers.cookie = options.actor.cookie;
    const hasBody = options.body !== undefined || options.rawBody !== undefined;
    if (hasBody) headers['content-type'] = 'application/json';
    const request = new Request(url, {
      method: route.method,
      headers,
      ...(hasBody ? { body: options.rawBody ?? JSON.stringify(options.body) } : {}),
    });
    // Comme Next.js : `params` vaut `undefined` quand la route n'a aucun segment dynamique.
    return route.handle(request, route.path.includes(':') ? params : undefined);
  }

  /** Inscription réelle (Better Auth), adresse vérifiée, connexion : renvoie le cookie de session. */
  async signUp(prefix = 'user'): Promise<Actor> {
    const email = `${unique(prefix)}@consulpro.test`.toLowerCase();
    await this.infra.auth.api.signUpEmail({ body: { email, password: PASSWORD, name: prefix } });
    await adminQuery(
      inject('database').adminUrl,
      'UPDATE users SET email_verified = true WHERE email = $1',
      [email],
    );
    const response = await this.infra.auth.handler(
      new Request(`${APP_URL}/api/auth/sign-in/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: APP_URL },
        body: JSON.stringify({ email, password: PASSWORD }),
      }),
    );
    if (response.status !== 200) throw new Error(`connexion impossible : ${response.status}`);
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0] ?? '')
      .join('; ');
    const body = (await response.json()) as { user: { id: string } };
    return { email, userId: body.user.id, cookie };
  }

  async createOrganization(owner: Actor): Promise<string> {
    const slug = unique('org').slice(0, 48);
    const response = await this.call('organizations.create', {
      actor: owner,
      body: { name: `Org ${slug}`, slug },
    });
    if (response.status !== 201)
      throw new Error(`organisation non créée : ${response.status} ${await response.text()}`);
    return slug;
  }

  /** Invite puis fait accepter : renvoie le nouveau membre et son identifiant d'adhésion. */
  async addMember(
    orgSlug: string,
    owner: Actor,
    role: OrgRole,
  ): Promise<Actor & { membershipId: string }> {
    const member = await this.signUp(role.toLowerCase());
    const invited = await this.call('invitations.create', {
      actor: owner,
      params: { orgSlug },
      body: { email: member.email, role },
    });
    if (invited.status !== 201) throw new Error(`invitation refusée : ${invited.status}`);
    const token = /invitation\/(\S+)/.exec(this.mailer.sent.at(-1)?.text ?? '')?.[1] ?? '';
    const accepted = await this.call('invitations.accept', { actor: member, body: { token } });
    if (accepted.status !== 200) throw new Error(`acceptation refusée : ${accepted.status}`);
    const list = (await (
      await this.call('members.list', { actor: owner, params: { orgSlug } })
    ).json()) as {
      items: { id: string; userId: string }[];
    };
    const membershipId = list.items.find((m) => m.userId === member.userId)?.id ?? '';
    return { ...member, membershipId };
  }

  /** Crée un projet BTP (le référentiel de démonstration publié est retenu par défaut). */
  async createProject(orgSlug: string, owner: Actor): Promise<string> {
    const code = unique('P')
      .replaceAll(/[^A-Za-z0-9]/g, '')
      .slice(-20)
      .toUpperCase();
    const response = await this.call('projects.create', {
      actor: owner,
      params: { orgSlug },
      body: { code, name: `Projet ${code}`, disciplines: ['BTP'] },
    });
    if (response.status !== 201)
      throw new Error(`projet non créé : ${response.status} ${await response.text()}`);
    return ((await response.json()) as { id: string }).id;
  }

  async addProjectMember(
    orgSlug: string,
    manager: Actor,
    projectId: string,
    userId: string,
    role: Exclude<OrgRole, 'OWNER' | 'ADMIN'>,
  ): Promise<string> {
    const response = await this.call('projectMembers.add', {
      actor: manager,
      params: { orgSlug, projectId },
      body: { userId, role },
    });
    if (response.status !== 201)
      throw new Error(`membre de projet refusé : ${response.status} ${await response.text()}`);
    return ((await response.json()) as { id: string }).id;
  }

  async invite(orgSlug: string, owner: Actor): Promise<string> {
    const response = await this.call('invitations.create', {
      actor: owner,
      params: { orgSlug },
      body: { email: `${unique('pending')}@consulpro.test`, role: 'VIEWER' },
    });
    return ((await response.json()) as { id: string }).id;
  }

  async close(): Promise<void> {
    await this.infra.db.$disconnect();
  }
}
