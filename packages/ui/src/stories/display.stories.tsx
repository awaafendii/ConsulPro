import type { Meta, StoryObj } from '@storybook/react-vite';

import { Avatar, AvatarFallback } from '../components/ui/avatar';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '../components/ui/breadcrumb';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu';
import { Kbd, KbdGroup } from '../components/ui/kbd';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '../components/ui/sheet';
import { Skeleton } from '../components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/ui/tooltip';

const meta: Meta = { title: 'Primitives/Affichage et surcouches' };
export default meta;

export const Carte: StoryObj = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Immeuble R+3 — Dakar</CardTitle>
        <CardDescription>BTP · Électricité · Plomberie</CardDescription>
      </CardHeader>
      <CardContent className="text-sm">12 études · 47 calculs · 3 non vérifiés</CardContent>
    </Card>
  ),
};

export const Onglets: StoryObj = {
  render: () => (
    <Tabs defaultValue="calculs" className="max-w-md">
      <TabsList>
        <TabsTrigger value="calculs">Calculs</TabsTrigger>
        <TabsTrigger value="documents">Documents</TabsTrigger>
        <TabsTrigger value="rapports">Rapports</TabsTrigger>
      </TabsList>
      <TabsContent value="calculs" className="text-sm">
        Liste des calculs de l’étude.
      </TabsContent>
      <TabsContent value="documents" className="text-sm">
        Documents du projet.
      </TabsContent>
      <TabsContent value="rapports" className="text-sm">
        Rapports générés.
      </TabsContent>
    </Tabs>
  ),
};

export const FilDAriane: StoryObj = {
  render: () => (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="#">BET Sahel</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink href="#">Immeuble R+3</BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>Chute de tension</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  ),
};

export const TouchesEtAvatar: StoryObj = {
  render: () => (
    <div className="flex items-center gap-6">
      <KbdGroup>
        <Kbd>Ctrl</Kbd>
        <Kbd>K</Kbd>
      </KbdGroup>
      <Avatar>
        <AvatarFallback>AD</AvatarFallback>
      </Avatar>
      <div className="w-48 space-y-2" role="status" aria-label="Chargement">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  ),
};

export const InfoBulle: StoryObj = {
  render: () => (
    <Tooltip defaultOpen>
      <TooltipTrigger asChild>
        <Button variant="outline">Survoler</Button>
      </TooltipTrigger>
      <TooltipContent>Disponible en Phase 3</TooltipContent>
    </Tooltip>
  ),
};

export const MenuDeroulant: StoryObj = {
  render: () => (
    <DropdownMenu defaultOpen>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">Actions</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Calcul</DropdownMenuLabel>
        <DropdownMenuItem>Recalculer</DropdownMenuItem>
        <DropdownMenuItem>Comparer deux révisions</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Rejeter</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
};

export const BoiteDeDialogue: StoryObj = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle étude</DialogTitle>
          <DialogDescription>Une étude regroupe les calculs d’un métier.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Annuler</Button>
          <Button>Créer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const PanneauLateral: StoryObj = {
  render: () => (
    <Sheet defaultOpen>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Paramètre</SheetTitle>
          <SheetDescription>Source et historique de vérification.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};

export const Fenetre: StoryObj = {
  render: () => (
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline">Source du paramètre</Button>
      </PopoverTrigger>
      <PopoverContent aria-label="Source du paramètre" className="text-sm">
        NF C 15-100 — article à citer (valeur à vérifier).
      </PopoverContent>
    </Popover>
  ),
};

export const ZoneDefilante: StoryObj = {
  render: () => (
    <ScrollArea className="h-40 w-64 rounded-md border" aria-label="Liste des points">
      <ul className="p-3 text-sm">
        {Array.from({ length: 30 }, (_, i) => (
          <li key={i} className="py-1">
            Point P{100 + i}
          </li>
        ))}
      </ul>
    </ScrollArea>
  ),
};

export const Separateur: StoryObj = {
  render: () => (
    <div className="flex h-5 items-center gap-3 text-sm">
      <span>Projet</span>
      <Separator orientation="vertical" />
      <span>Étude</span>
      <Separator orientation="vertical" />
      <span>Calcul</span>
    </div>
  ),
};

export const TableauSimple: StoryObj = {
  render: () => (
    <Table>
      <TableCaption>Quantités de béton par élément (exemple fictif)</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Élément</TableHead>
          <TableHead className="text-right">Volume (m³)</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Semelles</TableCell>
          <TableCell className="text-right">12,40</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Longrines</TableCell>
          <TableCell className="text-right">4,85</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right">17,25</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};
