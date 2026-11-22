/**
 * PaiBot – Regel-Tests der Lauf-Steuerung: keine festen Übergangswerte außerhalb der Nahtstellen, kein Weg in einen wartenden Zustand.
 *
 * Noch nicht gebaut: Die Fälle stehen als `it.todo` mit ihrer Gegenprobe im Kommentar.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, it } from "vitest";

describe("keine festen Übergangswerte", () => {
  // Quellen ohne Tests unter packages/agents/src und apps/worker/src.
  // Gegenprobe: `untrustedInput: false` in kontext.ts zurück → rot.
  it.todo(
    'keine Literale untrustedInput: false, step: 0, runTokens: 0, toolCount: 0, trigger: "chat" außerhalb von run/nahtstellen.ts',
  );
  it.todo("die Namen MAX_MOTOR_STEPS und TRANSITION_MAX_RUN_TOKENS kommen nirgends mehr vor");
});

describe("kein Weg in einen wartenden Zustand", () => {
  // Quellen ohne Tests in apps, packages, tools. Gegenprobe: Aufruf in eine Datei unter packages/agents/src einbauen → rot.
  it.todo('kein Aufruf von recordDecision mit "ask"');
  it.todo(
    "kein Aufruf von runs.markWaiting, runs.resume, toolCalls.approve, toolCalls.rejectByOwner, toolCalls.markRunning",
  );
  it.todo("kein Lesen von waitsForApproval");
});
