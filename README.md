# AppliMémo

Ma journée en blocs : planning, à faire, mémos et thématiques. PWA installable, utilisable hors-ligne.
Issue de MonPlanning (Python/Toga), réécrite pour le web.

**En ligne :** https://sebpix.github.io/AppliMemo/

## Structure
Barre du bas : **Journée · À faire · Check-listes · Mémos · Bibliothèque** ; roue ⚙︎ = Préférences.
- *Mise en forme* : la flèche ▾ du bandeau (avant ✓ et ⚙︎) déplie une barre gras / italique / souligné / taille / couleur / surlignage / alignement / puces, pour les textes longs (blocs de la journée, détails des tâches, mémo divers). Le texte brut est conservé à côté du HTML (recherche, #thèmes) ; voir `rich.js` et `core.js`.
- *À faire* : détail déroulant par ligne (▼) ; bandeau du haut : sauvegarder, versions, listes types, définir comme type, PDF.
- *Check-listes* : lignes compactes en 1/2/3 colonnes (20 lignes minimum par colonne), texte complet dans une fenêtre centrale au clic.
- *Mémos* : divers, mots de passe (coffre chiffré ; une **indication** obligatoire à la création, lisible coffre verrouillé via le bouton 💡 Indice, modifiable dans Préférences — elle est en clair, donc jamais le mot de passe lui-même), anniversaires, web, mails, lieux, photos (Bunny), **mémos vocaux** (enregistrement au micro ; les sons restent dans IndexedDB sur l’appareil, ils ne sont pas dans les exports JSON).
- *Bibliothèque* : arborescence de tout le contenu, recherche plein texte et `#thèmes`.

## Google Agenda (facultatif, `gcal.js`)
Préférences → carte **📆 Google Agenda** : adresse Gmail (facultative, préremplit la connexion), puis « Se connecter ». L'appli embarque l'identifiant client OAuth du projet Google Cloud de son auteur (public, pas un secret ; projet en **mode Test** : seuls les comptes ajoutés comme *utilisateurs de test* dans la console Google peuvent se connecter, 100 au maximum). Section « Avancé » : utiliser son propre identifiant (créer un projet Google Cloud, activer *Google Calendar API*, écran de consentement en mode Test avec son Gmail comme utilisateur de test, ID client *Application Web* dont l'origine autorisée est l'adresse du site, sans URI de redirection). Le script de Google n'est chargé qu'à l'ouverture d'une fenêtre 📆 Agenda.
- **Journée** : bouton 📆 Agenda → chaque bloc avec horaire = un événement horaire ; sous-titre + blocs sans horaire = un événement « toute la journée ».
- **Tâche** : bouton 📆 sur la ligne → date (+ heure) → événement. **Mémo** : bouton 📆 Agenda du bandeau.
- Chaque événement contient un **lien** (champ « source » + description) qui rouvre l'élément : `#/note/<id>` ou `#/journee/AAAA-MM-JJ`. « Copier le lien » permet aussi de le coller dans un événement créé à la main dans Google Agenda.
- Les événements ont un identifiant déterministe : renvoyer = mettre à jour, jamais dupliquer. Tant qu'on est connecté (jeton ~1 h, en mémoire seulement), les modifications sont renvoyées automatiquement ; retirer la date ou supprimer l'élément supprime l'événement.
- **« Titre seulement »** (activé par défaut, Préférences) : seuls titre, date et lien partent chez Google, jamais le texte des tâches, blocs ou mémos (l'agenda n'est pas chiffré et reste visible de qui y a accès). Le coffre de mots de passe n'envoie jamais que son titre.
- Rien ne part sans identifiant client ni connexion ; le reste de l'app reste local et hors-ligne.

## Archivage automatique
Chaque journée, note, check-liste, tâche et version a une durée d'archivage, réglable depuis le bandeau du haut (« Archive : … ») :
🔴 illimitée · 🟠 1 année · 🔵 1 mois · ⚪ 1 semaine · 🌈 à la demande : rien n'est effacé tout seul, l'app *propose* de supprimer à la date choisie (demain, 1 semaine, 1 mois, 1 an) (bandeau vertical à gauche de l'élément). Passé ce délai **sans modification**, l'élément est effacé
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
node tests/gcal.test.js         # événements Google Agenda (identifiants, horaires, liens)
# tests d'interface : ouvrir http://localhost:8000/tests/ui.html et tests/gcal-ui.html (résultats affichés sur la page)
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
