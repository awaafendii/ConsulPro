import { ENGINE_ID_PATTERN, SEMVER_PATTERN, type EngineDefinition } from '../engine';

// Les méthodes d'EngineDefinition sont bivariantes : tout moteur est assignable à ce type.
export type AnyEngine = EngineDefinition<unknown, unknown>;

/** Registre des moteurs disponibles (une version courante par identifiant). */
export class EngineRegistry {
  private readonly engines = new Map<string, AnyEngine>();

  register(engine: AnyEngine): void {
    if (!ENGINE_ID_PATTERN.test(engine.id)) {
      throw new Error(
        `Identifiant de moteur invalide : « ${engine.id} » (attendu : discipline.calcul).`,
      );
    }
    if (!SEMVER_PATTERN.test(engine.version)) {
      throw new Error(
        `Version invalide pour ${engine.id} : « ${engine.version} » (semver attendu).`,
      );
    }
    if (this.engines.has(engine.id)) {
      throw new Error(`Moteur déjà enregistré : ${engine.id}`);
    }
    const keys = engine.parameters.map((p) => p.key);
    if (new Set(keys).size !== keys.length) {
      throw new Error(`Paramètre déclaré deux fois par ${engine.id}.`);
    }
    this.engines.set(engine.id, engine);
  }

  get(id: string): AnyEngine | undefined {
    return this.engines.get(id);
  }

  list(): readonly AnyEngine[] {
    return [...this.engines.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  }
}
