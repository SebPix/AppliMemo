# AppliMémo

Ma journée en blocs : planning, à faire, mémos et thématiques. PWA installable, utilisable hors-ligne.
Issue de MonPlanning (Python/Toga), réécrite pour le web.

**En ligne :** https://sebpix.github.io/AppliMemo/

## Structure
Barre du bas : **Journée · À faire · Check-listes · Mémos · Bibliothèque** ; roue ⚙︎ = Préférences.
- *À faire* : détail déroulant par ligne (▼) ; bandeau du haut : sauvegarder, versions, listes types, définir comme type, PDF.
- *Check-listes* : lignes compactes en 1/2/3 colonnes (20 lignes minimum par colonne), texte complet dans une fenêtre centrale au clic.
- *Mémos* : divers, mots de passe (coffre chiffré), anniversaires, web, mails, lieux, photos (Bunny).
- *Bibliothèque* : arborescence de tout le contenu, recherche plein texte et `#thèmes`.

## Archivage automatique
Chaque journée, note, check-liste, tâche et version a une durée d'archivage, réglable depuis le bandeau du haut (« Archive : … ») :
🔴 illimitée · 🟠 1 année · 🔵 1 mois · ⚪ 1 semaine (bandeau vertical à gauche de l'élément). Passé ce délai **sans modification**, l'élément est effacé
à l'ouverture de l'app. Par défaut : illimitée. Voir `purgeExpired()` dans `app.js`.

## Fonctionnement
- HTML/CSS/JS purs, **aucune étape de build**, aucune dépendance.
- Les données restent **sur l'appareil** (localStorage). Sauvegarde et synchronisation entre appareils :
  menu ☰ → *Exporter* / *Importer* (`.json`). L'import **fusionne** : la version la plus récente de chaque élément gagne.
- Chaque élément a un `id`, un `updatedAt` et, s'il est supprimé, un `deletedAt` (voir `core.js`).

## Lancer en local
```sh
python3 -m http.server 8000     # puis http://localhost:8000
node tests/core.test.js         # tests de migration / fusion / annulation
node tests/vault.test.js        # tests du chiffrement du coffre
# tests d'interface : ouvrir http://localhost:8000/tests/ui.html (résultats affichés sur la page)
```

## Publier sur GitHub Pages
1. Pousser le contenu de ce dossier à la racine de la branche `main` du dépôt.
2. Dépôt → *Settings* → *Pages* → *Build and deployment* → Source : **Deploy from a branch** → `main` / `/ (root)`.
3. Après une minute, le site est en ligne. Tous les chemins sont relatifs : l'app fonctionne quel que soit le nom du dépôt.

Dépôt : https://github.com/SebPix/AppliMemo — adresse du site : `https://sebpix.github.io/AppliMemo/`.

## Mettre à jour
Modifier `CACHE` dans `sw.js` (`applimemo-vN` → `vN+1`…) à chaque publication, pour que les appareils rechargent les fichiers.

## Installer sur iPhone
Safari → Partager → *Sur l'écran d'accueil*.

## À venir
Synchronisation optionnelle via Supabase, sur invitation (code d'invitation + approbation manuelle).
