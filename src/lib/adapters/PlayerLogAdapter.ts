import { NormalizedDraftEvent } from "../draft/types";
import { object } from "./logData";
import { quickDraftAdapter } from "./QuickDraftAdapter";
import { premierDraftAdapter } from "./PremierDraftAdapter";

const QUICK = /BotDraft_?Draft(?:Status|Pick)/;
const PREMIER_PICK = /Event_?PlayerDraftMakePick/;

/** JSONエンベロープと別行ヘッダーはAdapter内に閉じ込める。 */
export class PlayerLogAdapter {
  private header = "";
  parse(line: string): NormalizedDraftEvent[] {
    const header = this.header;
    this.header = "";
    if (!line.includes("{") && (QUICK.test(line) || PREMIER_PICK.test(line) || line.includes("Draft.Notify"))) {
      this.header = line;
      return [];
    }
    try {
      const input = line.trimStart().startsWith("{") ? header + line : line;
      const start = input.indexOf("{");
      if (start < 0) return [];
      const prefix = input.slice(0, start);
      let data = object(input.slice(start));
      if (!data) return [];
      for (let depth = 0; depth < 4; depth++) {
        const next = data["request"] ?? data["Payload"];
        if (next === undefined) break;
        data = object(next);
        if (!data) return [];
      }
      if (QUICK.test(prefix) || data["DraftStatus"] === "PickNext") return quickDraftAdapter(prefix, data);
      if (prefix.includes("Draft.Notify") || PREMIER_PICK.test(prefix) || Array.isArray(data["CardsInPack"])) return premierDraftAdapter(prefix, data);
      return [];
    } catch { return []; }
  }
}
