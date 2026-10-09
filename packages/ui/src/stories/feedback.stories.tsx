import type { Meta, StoryObj } from '@storybook/react-vite';
import { FolderPlus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { Callout } from '../components/feedback/callout';
import { useConfirm } from '../components/feedback/confirm';
import { EmptyState, ErrorState, LoadingState } from '../components/feedback/states';
import { Button } from '../components/ui/button';

const meta: Meta = { title: 'Retours/États et messages' };
export default meta;

export const Encadres: StoryObj = {
  render: () => (
    <div className="grid max-w-xl gap-3">
      <Callout tone="info" title="Information">
        Les modules métier arrivent à partir de la Phase 3.
      </Callout>
      <Callout tone="success" title="Calcul vérifié">
        Vérifié par A. Diop le 08/10/2026.
      </Callout>
      <Callout tone="warning" title="Paramètre à vérifier">
        Ce résultat utilise des valeurs non confrontées au texte de la norme.
      </Callout>
      <Callout tone="destructive" title="Non conforme">
        La chute de tension dépasse la limite admissible.
      </Callout>
    </div>
  ),
};

export const Vide: StoryObj = {
  render: () => (
    <EmptyState
      icon={FolderPlus}
      title="Aucun projet"
      description="Créez un premier projet pour y rattacher vos études et calculs."
      action={<Button>Nouveau projet</Button>}
    />
  ),
};

export const Erreur: StoryObj = {
  render: () => (
    <ErrorState
      message="Le serveur n’a pas répondu. Vérifiez votre connexion puis réessayez."
      requestId="3f2a9c1e-77b0-4c1e-9d0e-5b8e0c6c2a11"
      onRetry={() => undefined}
    />
  ),
};

export const Chargement: StoryObj = { render: () => <LoadingState rows={4} /> };

function ConfirmDemo() {
  const confirm = useConfirm();
  const [result, setResult] = useState<string>('—');
  return (
    <div className="space-y-3">
      <Button
        variant="destructive"
        onClick={() => {
          void confirm({
            title: 'Retirer Moussa Traoré de l’organisation ?',
            description: 'Il perdra immédiatement l’accès à tous les projets de BET Sahel.',
            confirmLabel: 'Retirer',
            tone: 'destructive',
          }).then((ok) => {
            setResult(ok ? 'confirmé' : 'annulé');
          });
        }}
      >
        Retirer le membre
      </Button>
      <p className="text-sm" aria-live="polite">
        Résultat : {result}
      </p>
    </div>
  );
}

/** Boîte de confirmation : nomme l'objet concerné ; Échap = annuler. */
export const Confirmation: StoryObj = { render: () => <ConfirmDemo /> };

export const Notifications: StoryObj = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        onClick={() => toast.success('Invitation envoyée à moussa@bet-sahel.test')}
      >
        Succès
      </Button>
      <Button
        variant="outline"
        onClick={() => toast.error('Cette ressource a été modifiée entre-temps.')}
      >
        Erreur
      </Button>
      <Button variant="outline" onClick={() => toast.info('Calcul enregistré en révision 3.')}>
        Information
      </Button>
    </div>
  ),
};
