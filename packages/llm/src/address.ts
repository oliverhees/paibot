/**
 * PaiBot – Adressen einordnen: öffentlich, privat (auch Loopback) oder Link-Local/Metadaten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { isIPv4, isIPv6 } from "node:net";

/**
 * Einordnung einer IP-Adresse:
 * - `link_local`: Link-Local und Adressen der Metadaten-Dienste von Cloud-Anbietern
 * - `privat`: alles andere, was nicht öffentlich erreichbar ist (Loopback, private Netze,
 *   gemeinsamer Adressraum, Dokumentation, Multicast, reserviert)
 * - `oeffentlich`: alles übrige
 */
export type AddressClass = "oeffentlich" | "privat" | "link_local";

/** Adressen von Metadaten-Diensten, auch wenn sie in einem sonst öffentlichen Bereich liegen. */
const METADATA_IPV4 = new Set([
  "169.254.169.254",
  "169.254.170.2",
  "100.100.100.200",
  "168.63.129.16",
  "192.0.0.192",
]);

/** Namen von Metadaten-Diensten. */
export const METADATA_HOSTS: readonly string[] = [
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "instance-data.ec2.internal",
];

function parseIPv4(text: string): [number, number, number, number] | undefined {
  const parts = text.split(".");
  if (parts.length !== 4) return undefined;
  const numbers: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return undefined;
    const value = Number(part);
    if (value > 255) return undefined;
    numbers.push(value);
  }
  const [a, b, c, d] = numbers;
  if (a === undefined || b === undefined || c === undefined || d === undefined) return undefined;
  return [a, b, c, d];
}

/** Zerlegt eine IPv6-Adresse in acht Gruppen. Zonen (`%eth0`) und Klammern werden ignoriert. */
function parseIPv6(text: string): number[] | undefined {
  let value = text;
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  const zone = value.indexOf("%");
  if (zone >= 0) value = value.slice(0, zone);
  if (!isIPv6(value)) return undefined;

  // Angehängte IPv4-Schreibweise (`::ffff:1.2.3.4`) in zwei Gruppen umrechnen.
  const lastColon = value.lastIndexOf(":");
  const tail = value.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (!v4) return undefined;
    const high = ((v4[0] << 8) | v4[1]).toString(16);
    const low = ((v4[2] << 8) | v4[3]).toString(16);
    value = `${value.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = value.split("::");
  if (halves.length > 2) return undefined;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - head.length - rest.length;
    if (missing < 1) return undefined;
    groups = [...head, ...new Array<string>(missing).fill("0"), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return undefined;
  const numbers = groups.map((group) => Number.parseInt(group, 16));
  if (numbers.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return undefined;
  return numbers;
}

function classifyIPv4(octets: readonly [number, number, number, number]): AddressClass {
  const [a, b, c] = octets;
  if (METADATA_IPV4.has(octets.join("."))) return "link_local";
  if (a === 169 && b === 254) return "link_local";
  if (a === 0 || a === 10 || a === 127) return "privat";
  if (a === 100 && b >= 64 && b <= 127) return "privat";
  if (a === 172 && b >= 16 && b <= 31) return "privat";
  if (a === 192 && b === 168) return "privat";
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return "privat";
  // 6to4-Relay (Anycast, abgekündigt)
  if (a === 192 && b === 88 && c === 99) return "privat";
  if (a === 198 && (b === 18 || b === 19)) return "privat";
  if (a === 198 && b === 51 && c === 100) return "privat";
  if (a === 203 && b === 0 && c === 113) return "privat";
  if (a >= 224) return "privat";
  return "oeffentlich";
}

function embeddedIPv4(high: number, low: number): [number, number, number, number] {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function classifyIPv6(g: readonly number[]): AddressClass {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, g4 = 0, g5 = 0, g6 = 0, g7 = 0] = g;
  const firstFiveZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;

  // ::ffff:a.b.c.d (IPv4-abgebildet) und ::ffff:0:a.b.c.d (IPv4-übersetzt)
  if (firstFiveZero && g5 === 0xffff) return classifyIPv4(embeddedIPv4(g6, g7));
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0xffff && g5 === 0) {
    return classifyIPv4(embeddedIPv4(g6, g7));
  }
  // ::a.b.c.d (IPv4-kompatibel, veraltet), :: und ::1
  if (firstFiveZero && g5 === 0) {
    return g6 === 0 && g7 <= 1 ? "privat" : classifyIPv4(embeddedIPv4(g6, g7));
  }
  // 64:ff9b::/96 (NAT64) mit eingebetteter IPv4-Adresse
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return classifyIPv4(embeddedIPv4(g6, g7));
  }
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 1) return "privat";
  // 2002::/16 (6to4) mit eingebetteter IPv4-Adresse
  if (g0 === 0x2002) return classifyIPv4(embeddedIPv4(g1, g2));
  // fd00:ec2::254 (Metadaten bei AWS)
  if (g0 === 0xfd00 && g1 === 0x0ec2 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    if (g6 === 0 && g7 === 0x254) return "link_local";
  }
  if ((g0 & 0xffc0) === 0xfe80) return "link_local";
  if ((g0 & 0xffc0) === 0xfec0) return "privat";
  if ((g0 & 0xfe00) === 0xfc00) return "privat";
  if ((g0 & 0xff00) === 0xff00) return "privat";
  // 2001::/23: Bereich für besondere Zwecke (Teredo, Benchmark, ORCHID u. a.), Dokumentation,
  // Discard
  if (g0 === 0x2001 && g1 < 0x0200) return "privat";
  if (g0 === 0x2001 && g1 === 0x0db8) return "privat";
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return "privat";
  // 3fff::/20 (Dokumentation), 5f00::/16 (Segment-Routing)
  if (g0 === 0x3fff && (g1 & 0xf000) === 0) return "privat";
  if (g0 === 0x5f00) return "privat";
  // Alles außerhalb von 2000::/3 ist nicht als öffentliche Unicast-Adresse vergeben.
  if ((g0 & 0xe000) !== 0x2000) return "privat";
  return "oeffentlich";
}

/**
 * Ordnet eine IP-Adresse (IPv4 oder IPv6, auch mit Klammern oder Zone) ein. Etwas, das keine
 * IP-Adresse ist, gilt vorsichtshalber als `privat`.
 */
export function classifyIpAddress(address: string): AddressClass {
  const text = address.trim();
  if (isIPv4(text)) {
    const octets = parseIPv4(text);
    return octets ? classifyIPv4(octets) : "privat";
  }
  const groups = parseIPv6(text);
  return groups ? classifyIPv6(groups) : "privat";
}

/** Ob der Text eine IPv4- oder IPv6-Adresse ist (IPv6 auch in Klammern). */
export function isIpAddress(host: string): boolean {
  const text = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  return isIPv4(text) || isIPv6(text.split("%")[0] ?? text);
}

/** Normalisiert einen Host: Kleinschreibung, ohne Klammern um IPv6, ohne Punkt am Ende. */
export function normalizeHost(host: string): string {
  let value = host.toLowerCase();
  if (value.startsWith("[") && value.endsWith("]")) value = value.slice(1, -1);
  while (value.endsWith(".")) value = value.slice(0, -1);
  return value;
}
