export const ParsedEvent = { PickNext: "PickNext", PickSubmit: "PickSubmit", Unknown: "Unknown" } as const;
export const DraftFormat = { Quick: "QuickDraft", Premier: "PremierDraft" } as const;
const LogEvent = { Notify: "Draft.Notify", Status: "BotDraft_DraftStatus", CurrentStatus: "BotDraftDraftStatus", QuickPick: "BotDraft_DraftPick", CurrentQuickPick: "BotDraftDraftPick", PlayerPick: "Event_PlayerDraftMakePick" } as const;
type Format = (typeof DraftFormat)[keyof typeof DraftFormat];
export interface ParsedPickNext {
  type: typeof ParsedEvent.PickNext;
  format: Format;
  packNumber: number;
  pickNumber: number;
  draftPack: string[];
}
export interface ParsedPickSubmit {
  type: typeof ParsedEvent.PickSubmit;
  format: Format;
  packNumber: number;
  pickNumber: number;
  pickCard: string;
}
const UNKNOWN = { type: ParsedEvent.Unknown } as const;
type Parsed = ParsedPickNext | ParsedPickSubmit | typeof UNKNOWN;
type Data = Record<string, unknown>;

/** JSON文字列のエスケープを壊さず、必要なエンベロープだけを順に展開する。 */
function object(value: unknown): Data | undefined {
  if (typeof value === "string") value = JSON.parse(value);
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Data : undefined;
}
function card(value: unknown): string | undefined {
  return (typeof value === "string" && /^\d+$/.test(value)) || (typeof value === "number" && Number.isSafeInteger(value) && value > 0) ? String(value) : undefined;
}
function number(value: unknown, offset: number): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value + offset >= 1 ? value + offset : undefined;
}

/** Player.logの1行JSONを解析する。不正JSON・未対応スキーマは通知せず読み飛ばす。 */
export function parseLine(line: string): Parsed {
  try {
    const start = line.indexOf("{");
    if (start < 0) return UNKNOWN;
    const prefix = line.slice(0, start);
    let data = object(line.slice(start));
    if (!data) return UNKNOWN;
    for (let depth = 0; depth < 4; depth++) {
      const next = data["request"] ?? data["Payload"];
      if (next === undefined) break;
      data = object(next);
      if (!data) return UNKNOWN;
    }
    let format: Format = DraftFormat.Premier;
    let pack: unknown;
    let pick: unknown;
    let cards: unknown;
    let selected: unknown;
    let offset = 0;
    if (prefix.includes(LogEvent.PlayerPick)) {
      pack = data["Pack"]; pick = data["Pick"]; selected = data["GrpId"];
    } else if (prefix.includes(LogEvent.QuickPick) || prefix.includes(LogEvent.CurrentQuickPick)) {
      const info = object(data["PickInfo"]);
      if (!info) return UNKNOWN;
      format = DraftFormat.Quick;
      // 既存fixtureで確認したQuick Draftの0始まりを、包み方によらずUIの1始まりへ変換する。
      offset = 1;
      pack = info["PackNumber"]; pick = info["PickNumber"];
      // 現行ログは単一ピックでもCardIds配列。複数枚を1枚へ黙って縮めない。
      const cardIds = info["CardIds"];
      if (cardIds !== undefined && (!Array.isArray(cardIds) || cardIds.length !== 1)) return UNKNOWN;
      selected = Array.isArray(cardIds) ? cardIds[0] : info["CardId"];
    } else if (prefix.includes(LogEvent.Notify)) {
      pack = data["SelfPack"]; pick = data["SelfPick"];
      cards = typeof data["PackCards"] === "string" ? data["PackCards"].split(",") : undefined;
    } else if (Array.isArray(data["CardsInPack"])) {
      pack = data["PackNumber"]; pick = data["PickNumber"]; cards = data["CardsInPack"];
    } else if (prefix.includes(LogEvent.Status) || prefix.includes(LogEvent.CurrentStatus) || data["DraftStatus"] === ParsedEvent.PickNext) {
      if (data["DraftStatus"] !== undefined && data["DraftStatus"] !== ParsedEvent.PickNext) return UNKNOWN;
      format = DraftFormat.Quick;
      offset = 1;
      pack = data["PackNumber"]; pick = data["PickNumber"]; cards = data["DraftPack"];
    } else return UNKNOWN;
    const packNumber = number(pack, offset);
    const pickNumber = number(pick, offset);
    if (packNumber === undefined || pickNumber === undefined) return UNKNOWN;
    if (Array.isArray(cards) && cards.length > 0) {
      const draftPack = cards.map(card);
      if (draftPack.some(value => value === undefined)) return UNKNOWN;
      return { type: ParsedEvent.PickNext, format, packNumber, pickNumber, draftPack: draftPack as string[] };
    }
    const pickCard = card(selected);
    return pickCard === undefined ? UNKNOWN : { type: ParsedEvent.PickSubmit, format, packNumber, pickNumber, pickCard };
  } catch { return UNKNOWN; }
}

/** ヘッダーとJSONが別行の場合だけイベント名を次の行へ引き継ぐ。 */
export class PlayerLogParser {
  private header = "";
  parse(line: string): Parsed {
    const header = this.header;
    this.header = "";
    if (!line.includes("{") && Object.values(LogEvent).some(event => line.includes(event))) {
      this.header = line;
      return UNKNOWN;
    }
    return parseLine(line.trimStart().startsWith("{") ? header + line : line);
  }
}
