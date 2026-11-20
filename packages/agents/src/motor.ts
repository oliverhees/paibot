/**
 * PaiBot – Motor-Vertrag aus den gemeinsamen Verträgen, hier nur weitergereicht, plus die
 * Kennungen der Motoren.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

export {
  type JsonValue,
  MOTOR_ERROR_CODES,
  type Motor,
  type MotorCapabilities,
  type MotorErrorCode,
  type MotorEvent,
  type ResolvedModel,
  type ToolCall,
  type ToolResult,
  type ToolSpec,
  type TurnInput,
  type TurnMessage,
} from "@paibot/shared/motor";

/** Kennung des Motors auf dem Vercel AI SDK. */
export const AISDK_MOTOR_ID = "aisdk";

/** Kennung des Test-Motors. */
export const FAKE_MOTOR_ID = "fake";
