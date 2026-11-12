# CLAUDE.md - quotas-claude

Mod Claude Code (skill `plugin-authoring`) : bande au-dessus du prompt avec la consommation des
fenêtres 5 h et 7 jours et le delta (temps écoulé − quota utilisé). Utilisé dans l'app desktop.
Dépôt public sur le compte personnel (`DamienHarper/quotas-claude`), pas celui de l'entreprise.

## Fichiers

- `hooks/register.tsx` : tout le mod (états, dessin SVG, hooks, rendu).
- `types/index.d.ts` : contrat de `$.state` (`meter`, `now`, `mode`, `focus`).
- `.claude-plugin/plugin.json` (version), `.claude-plugin/marketplace.json` (installation par
  `--marketplace DamienHarper/quotas-claude`).
- `docs/*.png` : rendus du README, générés depuis le code avec `rsvg-convert` (sans les boutons).

## Principes

- **Aucun token** : pas d'appel au modèle, rien dans le contexte. `/quotas` renvoie `{}`. Les
  données viennent de `$.session.usage()` et de l'événement `session.measure`.
- **Thème** : couleurs en CSS dans le SVG (classes `f-<couleur>` / `s-<couleur>`,
  `@media (prefers-color-scheme: dark)`), car le thème suit l'OS.
- Pas de pastille de contexte : l'app l'affiche déjà.

## Rendu dans l'app desktop (constaté, non documenté)

- `gap` et `alignItems` sont ignorés : espacer avec une `Box` à padding autour de chaque bouton.
- Une `Box` sans style semble ignorée (son contenu part en haut à droite) ; une `Box` avec
  `paddingY` symétrique est rendue et centrée verticalement. Un `paddingTop` seul décale.
- Un `Svg` s'affiche comme une image : largeur fixe (W = 600), la version réduite fait la même
  largeur que la complète.
- Les barres en caractères rendent mal : tout dessiner en SVG.

## Versions et publication

- Bumper `version` dans `plugin.json` à chaque changement de code (Conventional Commits, en
  français, sans donnée personnelle).
- Deux copies du même nom se masquent (copie de dev, GitHub, bibliothèque de l'organisation) :
  la bibliothèque l'emportait. N'en garder qu'une active pour tester.
- Bibliothèque de l'organisation : `PublishPlugin` avec `replace: true` (accord de Damien à
  chaque fois) ; l'outil ne lit que le dossier dev-mods de la session, à synchroniser avec ce
  dépôt avant de publier. Le README n'y est pas : une modification du seul README ne demande
  pas de republication.
- Vérifier avant de livrer : `claude plugin validate .` et `tsc -p .`
  (`npx -p typescript@5.6.3 tsc`).
