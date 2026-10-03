import { NormalizedDraftEvent } from "../draft/types";
import { Data, cards, position, text } from "./logData";

const PREMIER_PICK = /Event_?PlayerDraftMakePick/;

/** Premier/既存Traditionalの1-based番号とdraft instance IDを正規化する。 */
export function premierDraftAdapter(prefix: string, data: Data): NormalizedDraftEvent[] {
  const draftId = text(data["draftId"] ?? data["DraftId"]);
  if (PREMIER_PICK.test(prefix)) {
    const pos = position(data["Pack"], data["Pick"], -1);
    const picked = cards(data["GrpIds"] ?? [data["GrpId"]]);
    return pos && picked && picked.length > 0 ? [{ type: "PickObserved", draftId, ...pos, pickedCardIds: picked }] : [];
  }
  const notify = prefix.includes("Draft.Notify");
  const pos = position(data[notify ? "SelfPack" : "PackNumber"], data[notify ? "SelfPick" : "PickNumber"], -1);
  const rawCards = notify ? data["PackCards"] : data["CardsInPack"];
  const pack = cards(typeof rawCards === "string" ? rawCards.split(",") : rawCards);
  return pos && pack && pack.length > 0 ? [{ type: "DraftPackObserved", draftId, eventName: text(data["EventName"] ?? data["eventName"]), ...pos, packCardIds: pack }] : [];
}

