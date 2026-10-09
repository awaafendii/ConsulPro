/**
 * Sérialisation JSON canonique (clés d'objets triées, aucun espace).
 * Sert à hacher les instantanés de paramètres et d'entrées de façon stable.
 * Le hachage lui-même est fait hors du moteur (infrastructure).
 */
export function canonicalJson(value: unknown): string {
  return serialize(value, '$');
}

function serialize(value: unknown, path: string): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError(`Nombre non fini en ${path}`);
      return JSON.stringify(Object.is(value, -0) ? 0 : value);
    case 'object': {
      if (Array.isArray(value)) {
        return `[${value.map((item, i) => serialize(item, `${path}[${i}]`)).join(',')}]`;
      }
      const record = value as Record<string, unknown>;
      const entries = Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${serialize(record[key], `${path}.${key}`)}`);
      return `{${entries.join(',')}}`;
    }
    default:
      throw new TypeError(`Valeur non sérialisable (${typeof value}) en ${path}`);
  }
}
