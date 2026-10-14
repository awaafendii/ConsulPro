/**
 * Matrice de permissions de l'API, GÉNÉRÉE depuis la matrice RBAC du domaine
 * (06-strategie-de-tests.md §4). Toute route du registre doit y figurer.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { can, grantFor, ORG_ROLES, type OrgRole } from '@consulpro/domain';
import { createDatabase, type Database } from '@consulpro/db';
import { loadStandard, setPlatformAdmin } from '@consulpro/infrastructure';
import { adminQuery, unique } from '@consulpro/test-utils';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';

import { Harness, type Actor, type CallOptions } from './harness';

/** Statut attendu quand l'accès est accordé. */
const SUCCESS: Readonly<Record<string, number>> = {
  'members.list': 200,
  'organization.get': 200,
  'organization.update': 200,
  'members.update': 200,
  'members.remove': 204,
  'invitations.list': 200,
  'invitations.create': 201,
  'invitations.revoke': 204,
  'audit.list': 200,
  'me.get': 200,
  'organizations.list': 200,
  'organizations.create': 201,
  'invitations.accept': 200,
  'projects.list': 200,
  'projects.create': 201,
  'projects.get': 200,
  'projects.update': 200,
  'projects.archive': 200,
  'projects.unarchive': 200,
  'projects.activity': 200,
  'projectMembers.list': 200,
  'projectMembers.add': 201,
  'projectMembers.update': 200,
  'projectMembers.remove': 204,
  'projectStandards.list': 200,
  'projectStandards.set': 204,
  'projectStandards.parameters': 200,
  'projectOverrides.list': 200,
  'projectOverrides.create': 201,
  'projectOverrides.update': 200,
  'projectOverrides.remove': 204,
  'library.standards': 200,
  'library.version': 200,
  'orgOverrides.list': 200,
  'orgOverrides.create': 201,
  'orgOverrides.update': 200,
  'orgOverrides.remove': 204,
  'platform.standardVersions.publish': 204,
  'platform.standardVersions.deprecate': 204,
  'studies.list': 200,
  'studies.create': 201,
  'studies.get': 200,
  'studies.update': 200,
  'engines.list': 200,
  'calculations.list': 200,
  'calculations.create': 201,
  'calculations.get': 200,
  'calculations.run': 201,
  'calculations.revisions': 200,
  'calculations.linkableOutputs': 200,
  'revisions.get': 200,
  'revisions.compare': 200,
  'revisions.validate': 200,
  'revisions.verify': 200,
  'datasets.kinds': 200,
  'datasets.list': 200,
  'datasets.create': 201,
  'datasets.get': 200,
  'datasets.revisions': 200,
  'datasets.saveRevision': 201,
  search: 200,
  'organization.transfer': 204,
  'notifications.list': 200,
  'notifications.read': 200,
  'preferences.get': 200,
  'preferences.update': 204,
  'takeoff.get': 200,
  'takeoffNodes.create': 201,
  'takeoffNodes.update': 200,
  'takeoffNodes.remove': 204,
  'takeoff.assign': 204,
  'boqs.list': 200,
  'boqs.create': 201,
  'boqs.get': 200,
  'boqs.update': 200,
  'boqs.remove': 204,
  'boqs.sync': 200,
  'boqs.materials': 200,
  'boqs.applyPrices': 200,
  'boqItems.create': 201,
  'boqItems.update': 200,
  'boqItems.remove': 204,
  'priceLibraries.list': 200,
  'priceLibraries.create': 201,
  'priceLibraries.get': 200,
  'priceLibraries.update': 200,
  'priceLibraries.remove': 204,
  'priceItems.create': 201,
  'priceItems.update': 200,
  'priceItems.remove': 204,
  'btp.dashboard': 200,
  'elec.dashboard': 200,
  'plumbing.dashboard': 200,
};

const slab = {
  length: { value: 10, unit: 'm' },
  width: { value: 5, unit: 'm' },
  thickness: { value: 20, unit: 'cm' },
};

const DEMO: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(
      new URL('../../../../packages/standards/seeds/demo/demo-1.json', import.meta.url),
    ),
    'utf8',
  ),
);

let h: Harness;
let adminDb: Database;
let orgSlug: string;
let owner: Actor;
const members = new Map<OrgRole, Actor>();
let stranger: Actor;
let outsider: Actor;
/** Membre de l'organisation sur lequel portent les actions de gestion des membres de projet. */
let target: Actor;
let platformAdmin: Actor;
/** Ingénieur auteur des calculs contrôlés (jamais l'un des acteurs testés). */
let calcAuthor: Actor;

type Request = CallOptions & { readonly cleanup?: (response: Response) => Promise<void> };

/** Étude, calcul et révision créés sur un projet (par le propriétaire, sauf `author`). */
async function studyOf(projectId: string) {
  return created(
    await h.call('studies.create', {
      actor: owner,
      params: { orgSlug, projectId },
      body: { discipline: 'BTP', title: 'Étude de test' },
    }),
  );
}
async function calculationOf(projectId: string, author: Actor = owner) {
  const studyId = await studyOf(projectId);
  return created(
    await h.call('calculations.create', {
      actor: author,
      params: { orgSlug, projectId, studyId },
      body: { title: 'Dalle', engineId: 'demo.slab-volume' },
    }),
  );
}
async function revisionOf(projectId: string, author: Actor = owner) {
  if (author !== owner) {
    await h.addProjectMember(orgSlug, owner, projectId, author.userId, 'ENGINEER');
  }
  const calculationId = await calculationOf(projectId, author);
  return created(
    await h.call('calculations.run', {
      actor: author,
      params: { orgSlug, projectId, calculationId },
      body: { inputs: slab },
    }),
  );
}
async function datasetOf(projectId: string) {
  return created(
    await h.call('datasets.create', {
      actor: owner,
      params: { orgSlug, projectId },
      body: { kind: 'ROOMS', title: 'Pièces' },
    }),
  );
}
let demoVersionId: string;

/** Lot d'avant-métré, quantitatif et ligne saisie (créés par le propriétaire). */
async function lotOf(projectId: string) {
  return created(
    await h.call('takeoffNodes.create', {
      actor: owner,
      params: { orgSlug, projectId },
      body: { parentId: null, kind: 'LOT', code: 'L1', title: 'Lot de test' },
    }),
  );
}
async function boqOf(projectId: string) {
  return created(
    await h.call('boqs.create', {
      actor: owner,
      params: { orgSlug, projectId },
      body: { title: 'DQE de test' },
    }),
  );
}
async function manualItemOf(projectId: string) {
  const boqId = await boqOf(projectId);
  const nodeId = await lotOf(projectId);
  const itemId = await created(
    await h.call('boqItems.create', {
      actor: owner,
      params: { orgSlug, projectId, boqId },
      body: { nodeId, designation: 'Installation', unit: 'ff', quantity: '1' },
    }),
  );
  return { boqId, itemId };
}
/** Bibliothèque de prix (nom unique), en XOF comme les quantitatifs de test. */
async function libraryOf() {
  return created(
    await h.call('priceLibraries.create', {
      actor: owner,
      params: { orgSlug },
      body: { name: unique('Prix'), currency: 'XOF' },
    }),
  );
}
async function priceItemOf() {
  const libraryId = await libraryOf();
  const itemId = await created(
    await h.call('priceItems.create', {
      actor: owner,
      params: { orgSlug, libraryId },
      body: { code: 'P-1', designation: 'Article de test', unit: 'u', price: '1000' },
    }),
  );
  return { libraryId, itemId };
}

const override = {
  key: 'demo.waste_rate',
  value: { kind: 'SCALAR', value: 6, unit: '%' },
  justification: 'Essai de permissions',
};

/** Supprime les surcharges d'organisation (une seule par paramètre et par niveau). */
async function clearOrgOverrides() {
  await adminQuery(
    inject('database').adminUrl,
    `DELETE FROM parameter_overrides WHERE project_id IS NULL
       AND organization_id = (SELECT id FROM organizations WHERE slug = $1)`,
    [orgSlug],
  );
}

async function created(response: Response): Promise<string> {
  if (response.status !== 201) throw new Error(`${response.status} ${await response.text()}`);
  return ((await response.json()) as { id: string }).id;
}

/** Construit une requête valide pour une route d'organisation (données fraîches à chaque appel). */
const orgRequests: Readonly<Record<string, () => Promise<Request>>> = {
  'members.list': () => Promise.resolve({}),
  'organization.get': () => Promise.resolve({}),
  // Mêmes valeurs que l'état courant : la modification réussie ne change rien (idempotente).
  'organization.update': async () => {
    const response = await h.call('organization.get', { actor: owner, params: { orgSlug } });
    const current = (await response.json()) as {
      name: string;
      country: string | null;
      currency: string;
      version: number;
    };
    return {
      body: { name: current.name, country: current.country, currency: current.currency },
      headers: { 'if-match': `"${String(current.version)}"` },
    };
  },
  'members.update': async () => {
    const member = await h.addMember(orgSlug, owner, 'VIEWER');
    return {
      params: { membershipId: member.membershipId },
      body: { role: 'VIEWER' },
      headers: { 'if-match': '"1"' },
    };
  },
  'members.remove': async () => {
    const member = await h.addMember(orgSlug, owner, 'VIEWER');
    return { params: { membershipId: member.membershipId }, headers: { 'if-match': '"1"' } };
  },
  'invitations.list': () => Promise.resolve({}),
  'invitations.create': () =>
    Promise.resolve({
      body: { email: `invite-${String(Math.random()).slice(2)}@consulpro.test`, role: 'VIEWER' },
    }),
  'invitations.revoke': async () => ({ params: { invitationId: await h.invite(orgSlug, owner) } }),
  'audit.list': () => Promise.resolve({}),
  'projects.list': () => Promise.resolve({ query: { status: 'ALL' } }),
  'projects.create': () => {
    const code = unique('C')
      .replaceAll(/[^A-Za-z0-9]/g, '')
      .slice(-20)
      .toUpperCase();
    return Promise.resolve({ body: { code, name: `Projet ${code}`, disciplines: ['BTP'] } });
  },
  'library.standards': () => Promise.resolve({}),
  'library.version': () => Promise.resolve({ params: { versionId: demoVersionId } }),
  'orgOverrides.list': () => Promise.resolve({}),
  'orgOverrides.create': async () => {
    await clearOrgOverrides();
    return { body: { ...override, standardVersionId: demoVersionId } };
  },
  'orgOverrides.update': async () => {
    await clearOrgOverrides();
    const id = await created(
      await h.call('orgOverrides.create', {
        actor: owner,
        params: { orgSlug },
        body: { ...override, standardVersionId: demoVersionId },
      }),
    );
    return {
      params: { overrideId: id },
      body: { value: { kind: 'SCALAR', value: 7, unit: '%' }, justification: 'Révision' },
      headers: { 'if-match': '"1"' },
    };
  },
  search: () => Promise.resolve({ query: { q: 'projet' } }),
  'priceLibraries.list': () => Promise.resolve({}),
  'priceLibraries.create': () =>
    Promise.resolve({ body: { name: unique('Prix'), currency: 'XOF', validFrom: '2026-01-01' } }),
  'priceLibraries.get': async () => ({ params: { libraryId: await libraryOf() } }),
  'priceLibraries.update': async () => ({
    params: { libraryId: await libraryOf() },
    body: { name: unique('Prix') },
    headers: { 'if-match': '"1"' },
  }),
  'priceLibraries.remove': async () => ({
    params: { libraryId: await libraryOf() },
    headers: { 'if-match': '"1"' },
  }),
  'priceItems.create': async () => ({
    params: { libraryId: await libraryOf() },
    body: { code: 'P-2', designation: 'Article créé', unit: 'm3', price: '65000.5' },
  }),
  'priceItems.update': async () => {
    const { libraryId, itemId } = await priceItemOf();
    return {
      params: { libraryId, itemId },
      body: { price: '1100' },
      headers: { 'if-match': '"1"' },
    };
  },
  'priceItems.remove': async () => {
    const { libraryId, itemId } = await priceItemOf();
    return { params: { libraryId, itemId }, headers: { 'if-match': '"1"' } };
  },
  'btp.dashboard': () => Promise.resolve({}),
  'elec.dashboard': () => Promise.resolve({}),
  'plumbing.dashboard': () => Promise.resolve({}),
  'organization.transfer': async () => {
    const target = await h.addMember(orgSlug, owner, 'VIEWER');
    return {
      body: { membershipId: target.membershipId },
      // En cas de succès, le bénéficiaire rend la propriété (les autres tests en dépendent).
      async cleanup(response) {
        if (response.status !== 204) return;
        const list = (await (
          await h.call('members.list', { actor: target, params: { orgSlug } })
        ).json()) as { items: { id: string; userId: string }[] };
        const back = list.items.find((m) => m.userId === owner.userId)?.id ?? '';
        const restored = await h.call('organization.transfer', {
          actor: target,
          params: { orgSlug },
          body: { membershipId: back },
        });
        if (restored.status !== 204) throw new Error(`restitution : ${String(restored.status)}`);
      },
    };
  },
  'orgOverrides.remove': async () => {
    await clearOrgOverrides();
    const id = await created(
      await h.call('orgOverrides.create', {
        actor: owner,
        params: { orgSlug },
        body: { ...override, standardVersionId: demoVersionId },
      }),
    );
    return { params: { overrideId: id }, headers: { 'if-match': '"1"' } };
  },
};

/** Requête valide pour une route de projet, sur un projet neuf (créé par le propriétaire). */
const projectRequests: Readonly<Record<string, (projectId: string) => Promise<CallOptions>>> = {
  'projects.get': () => Promise.resolve({}),
  'projects.update': () => {
    const code = unique('U')
      .replaceAll(/[^A-Za-z0-9]/g, '')
      .slice(-20)
      .toUpperCase();
    return Promise.resolve({
      body: { code, name: 'Projet renommé', disciplines: ['BTP'] },
      headers: { 'if-match': '"1"' },
    });
  },
  'projects.archive': () => Promise.resolve({ headers: { 'if-match': '"1"' } }),
  'projects.unarchive': async (projectId) => {
    const archived = await h.call('projects.archive', {
      actor: owner,
      params: { orgSlug, projectId },
      headers: { 'if-match': '"1"' },
    });
    if (archived.status !== 200) throw new Error(`archivage : ${archived.status}`);
    return { headers: { 'if-match': '"2"' } };
  },
  'projects.activity': () => Promise.resolve({}),
  'projectMembers.list': () => Promise.resolve({}),
  'projectMembers.add': () =>
    Promise.resolve({ body: { userId: target.userId, role: 'TECHNICIAN' } }),
  'projectMembers.update': async (projectId) => {
    const memberId = await h.addProjectMember(
      orgSlug,
      owner,
      projectId,
      target.userId,
      'TECHNICIAN',
    );
    return { params: { memberId }, body: { role: 'VIEWER' }, headers: { 'if-match': '"1"' } };
  },
  'projectMembers.remove': async (projectId) => {
    const memberId = await h.addProjectMember(
      orgSlug,
      owner,
      projectId,
      target.userId,
      'TECHNICIAN',
    );
    return { params: { memberId }, headers: { 'if-match': '"1"' } };
  },
  'projectStandards.list': () => Promise.resolve({}),
  'projectStandards.set': () =>
    Promise.resolve({
      params: { discipline: 'BTP' },
      body: { standardVersionIds: [demoVersionId] },
    }),
  'projectStandards.parameters': () => Promise.resolve({ params: { versionId: demoVersionId } }),
  'projectOverrides.list': () => Promise.resolve({}),
  'projectOverrides.create': () =>
    Promise.resolve({ body: { ...override, standardVersionId: demoVersionId } }),
  'projectOverrides.update': async (projectId) => {
    const id = await created(
      await h.call('projectOverrides.create', {
        actor: owner,
        params: { orgSlug, projectId },
        body: { ...override, standardVersionId: demoVersionId },
      }),
    );
    return {
      params: { overrideId: id },
      body: { value: { kind: 'SCALAR', value: 7, unit: '%' }, justification: 'Révision' },
      headers: { 'if-match': '"1"' },
    };
  },
  'studies.list': () => Promise.resolve({}),
  'studies.create': () => Promise.resolve({ body: { discipline: 'BTP', title: 'Étude créée' } }),
  'studies.get': async (projectId) => ({ params: { studyId: await studyOf(projectId) } }),
  'studies.update': async (projectId) => ({
    params: { studyId: await studyOf(projectId) },
    body: { title: 'Étude renommée' },
    headers: { 'if-match': '"1"' },
  }),
  'engines.list': () => Promise.resolve({}),
  'calculations.list': async (projectId) => ({ params: { studyId: await studyOf(projectId) } }),
  'calculations.create': async (projectId) => ({
    params: { studyId: await studyOf(projectId) },
    body: { title: 'Dalle', engineId: 'demo.slab-volume' },
  }),
  'calculations.get': async (projectId) => ({
    params: { calculationId: await calculationOf(projectId) },
  }),
  'calculations.run': async (projectId) => ({
    params: { calculationId: await calculationOf(projectId) },
    body: { inputs: slab },
  }),
  'calculations.revisions': async (projectId) => ({
    params: { calculationId: await calculationOf(projectId) },
  }),
  'calculations.linkableOutputs': async (projectId) => ({
    params: { calculationId: await calculationOf(projectId) },
  }),
  'revisions.get': async (projectId) => ({ params: { revisionId: await revisionOf(projectId) } }),
  'revisions.compare': async (projectId) => {
    const first = await revisionOf(projectId);
    return { params: { revisionId: first }, query: { with: first } };
  },
  // Validation réservée à l'auteur (OWN) : aucun acteur testé n'est l'auteur, d'où 403.
  'revisions.validate': async (projectId) => ({
    params: { revisionId: await revisionOf(projectId, calcAuthor) },
    body: {},
  }),
  'revisions.verify': async (projectId) => {
    const revisionId = await revisionOf(projectId, calcAuthor);
    const validated = await h.call('revisions.validate', {
      actor: calcAuthor,
      params: { orgSlug, projectId, revisionId },
      body: {},
    });
    if (validated.status !== 200) throw new Error(`validation : ${String(validated.status)}`);
    return { params: { revisionId }, body: { decision: 'APPROVED' } };
  },
  'datasets.kinds': () => Promise.resolve({}),
  'datasets.list': () => Promise.resolve({}),
  'datasets.create': () => Promise.resolve({ body: { kind: 'ROOMS', title: 'Pièces R+1' } }),
  'datasets.get': async (projectId) => ({ params: { datasetId: await datasetOf(projectId) } }),
  'datasets.revisions': async (projectId) => ({
    params: { datasetId: await datasetOf(projectId) },
  }),
  'datasets.saveRevision': async (projectId) => ({
    params: { datasetId: await datasetOf(projectId) },
    body: { rows: [{ name: 'Séjour', area: { value: 24, unit: 'm2' } }] },
    headers: { 'if-match': '"1"' },
  }),
  'takeoff.get': () => Promise.resolve({}),
  'takeoffNodes.create': () =>
    Promise.resolve({ body: { parentId: null, kind: 'LOT', code: '1', title: 'Fondations' } }),
  'takeoffNodes.update': async (projectId) => ({
    params: { nodeId: await lotOf(projectId) },
    body: { title: 'Lot renommé' },
    headers: { 'if-match': '"1"' },
  }),
  'takeoffNodes.remove': async (projectId) => ({
    params: { nodeId: await lotOf(projectId) },
    headers: { 'if-match': '"1"' },
  }),
  'takeoff.assign': async (projectId) => ({
    params: { calculationId: await calculationOf(projectId) },
    body: { nodeId: await lotOf(projectId) },
  }),
  'boqs.list': () => Promise.resolve({}),
  'boqs.create': () => Promise.resolve({ body: { title: 'DQE créé', currency: 'XOF' } }),
  'boqs.get': async (projectId) => ({ params: { boqId: await boqOf(projectId) } }),
  'boqs.update': async (projectId) => ({
    params: { boqId: await boqOf(projectId) },
    body: { title: 'DQE renommé' },
    // Création, puis report des quantités : version 2.
    headers: { 'if-match': '"2"' },
  }),
  'boqs.remove': async (projectId) => ({
    params: { boqId: await boqOf(projectId) },
    headers: { 'if-match': '"2"' },
  }),
  'boqs.sync': async (projectId) => ({ params: { boqId: await boqOf(projectId) } }),
  'boqs.materials': async (projectId) => ({ params: { boqId: await boqOf(projectId) } }),
  'boqs.applyPrices': async (projectId) => ({
    params: { boqId: await boqOf(projectId) },
    body: { libraryId: await libraryOf(), overwrite: false },
  }),
  'boqItems.create': async (projectId) => ({
    params: { boqId: await boqOf(projectId) },
    body: { nodeId: await lotOf(projectId), designation: 'Essais', unit: 'ff', quantity: '1' },
  }),
  'boqItems.update': async (projectId) => {
    const { boqId, itemId } = await manualItemOf(projectId);
    return {
      params: { boqId, itemId },
      body: { unitPrice: '250000' },
      headers: { 'if-match': '"1"' },
    };
  },
  'boqItems.remove': async (projectId) => {
    const { boqId, itemId } = await manualItemOf(projectId);
    return { params: { boqId, itemId }, headers: { 'if-match': '"1"' } };
  },
  'projectOverrides.remove': async (projectId) => {
    const id = await created(
      await h.call('projectOverrides.create', {
        actor: owner,
        params: { orgSlug, projectId },
        body: { ...override, standardVersionId: demoVersionId },
      }),
    );
    return { params: { overrideId: id }, headers: { 'if-match': '"1"' } };
  },
};

/** Requête valide pour une route « utilisateur authentifié », pour un acteur donné. */
const userRequests: Readonly<Record<string, (actor: Actor) => Promise<CallOptions>>> = {
  'me.get': () => Promise.resolve({}),
  'organizations.list': () => Promise.resolve({}),
  'organizations.create': () => {
    const slug = 'cree-' + String(Math.random()).slice(2, 14);
    return Promise.resolve({ body: { name: `Org ${slug}`, slug } });
  },
  'notifications.list': () => Promise.resolve({ query: { unread: 'true' } }),
  'notifications.read': () => Promise.resolve({ body: {} }),
  'preferences.get': () => Promise.resolve({}),
  'preferences.update': () => Promise.resolve({ body: { timeZone: 'Africa/Dakar' } }),
  'invitations.accept': async (actor) => {
    const other = await h.signUp('inviteur');
    const slug = await h.createOrganization(other);
    await h.call('invitations.create', {
      actor: other,
      params: { orgSlug: slug },
      body: { email: actor.email, role: 'VIEWER' },
    });
    const token = /invitation\/(\S+)/.exec(h.mailer.sent.at(-1)?.text ?? '')?.[1] ?? '';
    return { body: { token } };
  },
};

/** Version système fraîche : brouillon (publication) ou publiée (dépréciation). */
async function systemVersion(published: boolean): Promise<string> {
  const loaded = await loadStandard(
    adminDb,
    { ...(DEMO as object), version: { label: unique('v') } },
    published ? { publishAs: platformAdmin.email } : {},
  );
  if (!loaded.ok) throw new Error(loaded.error);
  return loaded.value.standardVersionId;
}

const platformRequests: Readonly<Record<string, () => Promise<CallOptions>>> = {
  'platform.standardVersions.publish': async () => ({
    params: { versionId: await systemVersion(false) },
  }),
  'platform.standardVersions.deprecate': async () => ({
    params: { versionId: await systemVersion(true) },
  }),
};

beforeAll(async () => {
  h = new Harness();
  adminDb = createDatabase(inject('database').adminUrl, { max: 2 });
  platformAdmin = await h.signUp('plateforme');
  const granted = await setPlatformAdmin(adminDb, platformAdmin.email, true);
  if (!granted.ok) throw new Error(granted.error);
  // Une version publiée de DEMO est indispensable aux routes de référentiels.
  const demo = await loadStandard(adminDb, DEMO, { publishAs: platformAdmin.email });
  if (!demo.ok) throw new Error(demo.error);
  demoVersionId = demo.value.standardVersionId;

  owner = await h.signUp('owner');
  orgSlug = await h.createOrganization(owner);
  members.set('OWNER', owner);
  for (const role of ORG_ROLES.filter((r) => r !== 'OWNER')) {
    members.set(role, await h.addMember(orgSlug, owner, role));
  }
  target = await h.addMember(orgSlug, owner, 'TECHNICIAN');
  calcAuthor = await h.addMember(orgSlug, owner, 'ENGINEER');
  stranger = await h.signUp('stranger');
  outsider = await h.signUp('outsider');
  await h.createOrganization(outsider);
});

afterAll(async () => {
  await adminDb.$disconnect();
  await h.close();
});

describe('couverture de la matrice', () => {
  it('chaque route du registre a un générateur de requête et un statut de succès', () => {
    const builders = {
      organization: orgRequests,
      project: projectRequests,
      user: userRequests,
      platform: platformRequests,
    } as const;
    for (const route of h.routes.values()) {
      expect(
        builders[route.access.kind][route.id],
        `route ${route.id} absente de la matrice de tests`,
      ).toBeDefined();
      expect(SUCCESS[route.id], `statut de succès manquant pour ${route.id}`).toBeDefined();
    }
  });
});

describe('routes d’organisation : rôle × permission', () => {
  for (const id of Object.keys(orgRequests)) {
    describe(id, () => {
      for (const role of ORG_ROLES) {
        it(role, async () => {
          const route = h.route(id);
          if (route.access.kind !== 'organization')
            throw new Error('route d’organisation attendue');
          const request = await orgRequests[id]!();
          const response = await h.call(id, {
            ...request,
            actor: members.get(role)!,
            params: { orgSlug, ...request.params },
          });
          const expected = can(role, route.access.permission) ? SUCCESS[id] : 403;
          expect(response.status, await response.clone().text()).toBe(expected);
          await request.cleanup?.(response);
        });
      }

      it('non-membre de l’organisation : 404 (existence non révélée)', async () => {
        const request = await orgRequests[id]!();
        const response = await h.call(id, {
          ...request,
          actor: stranger,
          params: { orgSlug, ...request.params },
        });
        expect(response.status).toBe(404);
      });

      it('membre d’une autre organisation : 404', async () => {
        const request = await orgRequests[id]!();
        const response = await h.call(id, {
          ...request,
          actor: outsider,
          params: { orgSlug, ...request.params },
        });
        expect(response.status).toBe(404);
      });

      it('non authentifié : 401', async () => {
        const request = await orgRequests[id]!();
        const response = await h.call(id, {
          ...request,
          actor: null,
          params: { orgSlug, ...request.params },
        });
        expect(response.status).toBe(401);
      });
    });
  }
});

/** Owner et Admin accèdent à tout projet ; les autres rôles seulement s'ils en sont membres. */
const isManager = (role: OrgRole) => role === 'OWNER' || role === 'ADMIN';

async function callOnProject(id: string, actor: Actor | null, role: OrgRole | null) {
  const projectId = await h.createProject(orgSlug, owner);
  if (role && !isManager(role)) {
    await h.addProjectMember(orgSlug, owner, projectId, actor!.userId, role);
  }
  const request = await projectRequests[id]!(projectId);
  return h.call(id, { ...request, actor, params: { orgSlug, projectId, ...request.params } });
}

describe('routes de projet : rôle effectif × permission', () => {
  for (const id of Object.keys(projectRequests)) {
    describe(id, () => {
      for (const role of ORG_ROLES) {
        it(`${role}, membre du projet avec ce rôle`, async () => {
          const route = h.route(id);
          if (route.access.kind !== 'project') throw new Error('route de projet attendue');
          const response = await callOnProject(id, members.get(role)!, role);
          const expected = can(role, route.access.permission) ? SUCCESS[id] : 403;
          expect(response.status, await response.clone().text()).toBe(expected);
        });
      }

      for (const role of ORG_ROLES.filter((r) => !isManager(r))) {
        it(`${role}, non membre du projet : 404 (ou 403 si le rôle ne l’autorise jamais)`, async () => {
          const route = h.route(id);
          if (route.access.kind !== 'project') throw new Error('route de projet attendue');
          const response = await callOnProject(id, members.get(role)!, null);
          const expected = grantFor(role, route.access.permission) === 'NONE' ? 403 : 404;
          expect(response.status, await response.clone().text()).toBe(expected);
        });
      }

      it('ingénieur réduit au rôle de lecteur sur le projet : le plus restrictif l’emporte', async () => {
        const route = h.route(id);
        if (route.access.kind !== 'project') throw new Error('route de projet attendue');
        const projectId = await h.createProject(orgSlug, owner);
        const engineer = members.get('ENGINEER')!;
        await h.addProjectMember(orgSlug, owner, projectId, engineer.userId, 'VIEWER');
        const request = await projectRequests[id]!(projectId);
        const response = await h.call(id, {
          ...request,
          actor: engineer,
          params: { orgSlug, projectId, ...request.params },
        });
        const expected = can('VIEWER', route.access.permission) ? SUCCESS[id] : 403;
        expect(response.status, await response.clone().text()).toBe(expected);
      });

      it('membre d’une autre organisation ou inconnu : 404 ; anonyme : 401', async () => {
        expect((await callOnProject(id, outsider, null)).status).toBe(404);
        expect((await callOnProject(id, stranger, null)).status).toBe(404);
        expect((await callOnProject(id, null, null)).status).toBe(401);
      });
    });
  }
});

describe('routes utilisateur', () => {
  for (const id of Object.keys(userRequests)) {
    it(`${id} : authentifié → succès, anonyme → 401`, async () => {
      const actor = await h.signUp('user-route');
      const request = await userRequests[id]!(actor);
      expect((await h.call(id, { ...request, actor })).status).toBe(SUCCESS[id]);
      expect((await h.call(id, { ...(await userRequests[id]!(actor)), actor: null })).status).toBe(
        401,
      );
    });
  }
});

describe('routes de la plateforme', () => {
  for (const id of Object.keys(platformRequests)) {
    it(`${id} : administrateur de la plateforme → succès ; autre utilisateur → 403 ; anonyme → 401`, async () => {
      expect((await h.call(id, { ...(await platformRequests[id]!()), actor: owner })).status).toBe(
        403,
      );
      expect((await h.call(id, { ...(await platformRequests[id]!()), actor: null })).status).toBe(
        401,
      );
      const response = await h.call(id, {
        ...(await platformRequests[id]!()),
        actor: platformAdmin,
      });
      expect(response.status, await response.clone().text()).toBe(SUCCESS[id]);
    });
  }
});
