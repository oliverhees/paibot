/**
 * PaiBot – Öffentliche UI-Komponenten und Hilfen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

// Die Tokens liegen in `@paibot/ui/tokens.css`.

export * from "./app-bausteine/index";
export { FORM_ZU_FARBE, FORMEN, formFuer, gesichtFuer } from "./avatar/formen";
export type { Zufall } from "./avatar/zufall";
export {
  AvatarLebendig,
  type AvatarLebendigProps,
  type AvatarLebendigSteuerung,
} from "./avatar-lebendig/AvatarLebendig";
export {
  AVATAR_AUSDRUECKE,
  AVATAR_LEBENDIG_ZUSTAENDE,
  type AvatarAusdruck,
  type AvatarLebendigZustand,
  FORM_GESICHT,
  type FormGesicht,
} from "./avatar-lebendig/daten";
export { AvatarLebendigVorschau } from "./avatar-lebendig/Vorschau";
export { Button, type ButtonArt, type ButtonProps } from "./basis/Button";
export {
  ERSTER_FOKUS,
  fokussierbareIn,
  menueIndex,
  naechstesZiel,
  startZiel,
} from "./basis/fokus";
export { ICON_NAMEN, Icon, type IconName, type IconProps } from "./basis/Icon";
export { IconButton, type IconButtonProps } from "./basis/IconButton";
export { Karte, type KarteProps } from "./basis/Karte";
export { klassen } from "./basis/klassen";
export { Ladekreis } from "./basis/Ladekreis";
export { Logo, type LogoProps } from "./basis/Logo";
export { NurLesbar } from "./basis/NurLesbar";
export { ScrollBereich, type ScrollBereichProps } from "./basis/ScrollBereich";
export { type ScrollMasse, type ScrollRand, scrollRand, scrollt } from "./basis/scrollRand";
export { type FokusFalleOptionen, useFokusFalle } from "./basis/useFokusFalle";
export { Wortmarke } from "./basis/Wortmarke";
export {
  AnkerKasten,
  type AnkerKastenProps,
  type AnkerKastenTexte,
} from "./belege/AnkerKasten";
export {
  BelegKarte,
  type BelegKarteProps,
  type BelegKarteZeile,
  type BelegSiegel,
} from "./belege/BelegKarte";
export {
  PruefUrteil,
  type PruefUrteilProps,
  type PruefUrteilPunkt,
  type PruefUrteilZustand,
} from "./belege/PruefUrteil";
export {
  type RegelEintrag,
  RegelListe,
  type RegelListeProps,
  type RegelStufe,
  TorWeg,
  type TorWegProps,
} from "./belege/RegelListe";
export {
  AntwortZeile,
  type AntwortZeileProps,
  type BelegAngabe,
  BelegZeile,
  type BelegZustand,
  type HerkunftSchritt,
  type ModellAngabe,
  ModellHerkunft,
  type SchleuseAngabe,
  SchleuseHinweis,
  SchritteHerkunft,
} from "./chat/AntwortZeile";
export { ChatBubble, type ChatBubbleProps } from "./chat/ChatBubble";
export { ChatEingabe, type ChatEingabeProps } from "./chat/ChatEingabe";
export { EntwurfBlock, type EntwurfBlockProps, type EntwurfTexte } from "./chat/EntwurfBlock";
export { type EingabeAktion, eingabeAktion, sendbar } from "./chat/eingabe";
export { Markdown, type MarkdownProps } from "./chat/Markdown";
export * from "./chat/schritte";
export { sichereUrl } from "./chat/sichereUrl";
export * from "./faden";
export { Select, type SelectOption, type SelectProps } from "./felder/Select";
export { SuchFeld, type SuchFeldProps } from "./felder/SuchFeld";
export { Switch, type SwitchProps } from "./felder/Switch";
export { TextArea, type TextAreaProps } from "./felder/TextArea";
export { TextField, type TextFieldProps } from "./felder/TextField";
export {
  AppShell,
  type AppShellFlaeche,
  type AppShellNavigation,
  type AppShellProps,
  type AppShellTexte,
  type NavBot,
  type NavEintrag,
  type NavTeam,
  type NavUnterhaltung,
} from "./shell/AppShell";
export {
  flaecheModal,
  flaecheUeberlagert,
  navAlsMenue,
  SHELL_GRENZEN,
  type ShellModus,
  shellModus,
} from "./shell/modus";
export { SeitenSpalte, type SeitenSpalteProps } from "./shell/SeitenSpalte";
export * from "./startbereich";
export * from "./teams";
export { Dialog, type DialogProps } from "./ueberlagerung/Dialog";
export { Menue, type MenueEintrag, type MenueProps } from "./ueberlagerung/Menue";
export { Reiter, type ReiterEintrag, type ReiterProps } from "./ueberlagerung/Reiter";
export { type ReiterLink, ReiterLinks, type ReiterLinksProps } from "./ueberlagerung/ReiterLinks";
export {
  Footer,
  footerTeile,
  HR_CODELABS_URL,
  PAIBOT_DOKU_URL,
  PAIBOT_ROADMAP_URL,
  PAIBOT_URL,
} from "./zustaende/Footer";
export { PruefErgebnis, type PruefErgebnisProps, type PruefPunkt } from "./zustaende/PruefErgebnis";
export { type StatusArt, StatusChip, type StatusChipProps } from "./zustaende/StatusChip";
export { TestErgebnis, type TestErgebnisProps } from "./zustaende/TestErgebnis";
export {
  EmptyState,
  type EmptyStateProps,
  ErrorState,
  type ErrorStateProps,
  LoadingState,
  type LoadingStateProps,
} from "./zustaende/Zustaende";
