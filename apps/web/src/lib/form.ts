/** Valeur texte d'un champ de formulaire (chaîne vide si absent ou fichier). */
export function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
