import { NormalizedDraftEvent } from "../draft/types";
import { Data, object, cards, position, text } from "./logData";

/** Quickの0-based番号、CardId(s)、累積PickedCardsを境界で正規化する。 */
export function quickDraftAdapter(prefix: string, data: Data): NormalizedDraftEvent[] {
  const draftId = text(data["draftId"] ?? data["DraftId"]);
  const snapshot = cards(data["PickedCards"]);
  const events: NormalizedDraftEvent[] = [];
  if (/BotDraft_?DraftPick/.test(prefix) && data["PickInfo"] !== undefined) {
    const info = object(data["PickInfo"]);
    const pos = info && position(info["PackNumber"], info["PickNumber"], 0);
    const picked = info && cards(info["CardIds"] ?? [info["CardId"]]);
    if (pos && picked && picked.length > 0) events.push({ type: "PickObserved", draftId, ...pos, pickedCardIds: picked });
  } else if (data["DraftStatus"] === undefined || data["DraftStatus"] === "PickNext") {
    const pos = position(data["PackNumber"], data["PickNumber"], 0);
    const pack = cards(data["DraftPack"]);
    if (pos && pack && pack.length > 0) events.push({ type: "DraftPackObserved", draftId, eventName: text(data["EventName"] ?? data["eventName"]), ...pos, packCardIds: pack });
  }
  // 新Draft境界のPackを先にreduceし、その後に同じログの累積Snapshotを適用する。
  if (snapshot) events.push({ type: "PickedCardsSnapshotObserved", draftId, pickedCardIds: snapshot });
  return events;
}

