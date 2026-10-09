import { zodResolver } from '@hookform/resolvers/zod';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../components/ui/form';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Switch } from '../components/ui/switch';
import { Textarea } from '../components/ui/textarea';

const meta: Meta = { title: 'Formulaires/Champs' };
export default meta;

export const Champs: StoryObj = {
  render: () => (
    <div className="grid max-w-md gap-5">
      <div className="grid gap-2">
        <Label htmlFor="nom">Nom du projet</Label>
        <Input id="nom" placeholder="Immeuble R+3 — Dakar" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="longueur">Longueur (m)</Label>
        <Input
          id="longueur"
          inputMode="decimal"
          aria-invalid
          aria-describedby="longueur-erreur"
          defaultValue="-3"
        />
        <p id="longueur-erreur" className="text-sm text-destructive">
          La longueur doit être strictement positive.
        </p>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="desactive">Champ désactivé</Label>
        <Input id="desactive" disabled defaultValue="Non modifiable" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="obs">Observations</Label>
        <Textarea id="obs" placeholder="Observations de chantier…" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="discipline">Discipline</Label>
        <Select defaultValue="ELEC">
          <SelectTrigger id="discipline" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BTP">BTP / Génie civil</SelectItem>
            <SelectItem value="ELEC">Électricité</SelectItem>
            <SelectItem value="PLUMBING">Plomberie & Sanitaire</SelectItem>
            <SelectItem value="TOPO">Topographie</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="verifie" defaultChecked />
        <Label htmlFor="verifie">Paramètre vérifié par deux personnes</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="apercu" />
        <Label htmlFor="apercu">Aperçu instantané</Label>
      </div>
    </div>
  ),
};

const schema = z.object({
  name: z.string().trim().min(2, 'Au moins 2 caractères.'),
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Minuscules, chiffres et tirets uniquement.'),
});

function OrganizationForm() {
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '' },
    mode: 'onTouched',
  });
  return (
    <Form {...form}>
      <form
        noValidate
        onSubmit={(e) => void form.handleSubmit(() => undefined)(e)}
        className="grid max-w-md gap-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nom de l’organisation</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Identifiant d’URL</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormDescription>Utilisé dans l’adresse : /bet-sahel/…</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-fit">
          Créer l’organisation
        </Button>
      </form>
    </Form>
  );
}

/** React Hook Form + Zod : mêmes schémas qu'au serveur (packages/contracts). */
export const FormulaireValide: StoryObj = { render: () => <OrganizationForm /> };
