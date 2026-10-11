import { NormalizedDraftEvent } from "../draft/types";
import { object, text } from "./logData";

const Stage = { Response: "response", Queue: "queue", Pack: "pack" } as const;
type Pending = { requestId: string; eventName: string; expansion: string; stage: typeof Stage[keyof typeof Stage] };

/** 参加成功とセット一致の待機画面を経た新規P1P1だけに、イベント名を引き継ぐ。 */
export class PremierEventContext {
  private pending?: Pending;
  private responseId?: string;
  private active?: { draftId: string; eventName: string };
  private readonly seenDraftIds = new Set<string>();

  observe(line: string): void {
    try { this.observeLine(line); }
    catch {
      // 壊れた応答や要求を成功とみなさず、監視ループ自体は継続する。
      this.pending = undefined;
      this.responseId = undefined;
    }
  }

  private observeLine(line: string): void {
    const response = /<== EventJoin\(([^)]+)\)/.exec(line);
    const responseId = response?.[1] ?? this.responseId;
    this.responseId = undefined;
    if (response && !line.includes("{")) { this.responseId = responseId; return; }
    const start = line.indexOf("{");
    if (start < 0) return;
    const data = object(line.slice(start));
    const prefix = line.slice(0, start);
    if (/==> EventJoin\b/.test(prefix)) {
      // 再参加や別形式への参加要求があれば、前の候補を無条件に捨てる。
      this.pending = undefined;
      const request = object(data?.["request"]);
      const eventName = text(request?.["EventName"]);
      // 確認済みの日付付き通常Premierの命名だけを扱い、特殊形式や未知の別名は推測しない。
      const match = eventName && /^PremierDraft_([A-Z0-9]+)_\d{8}$/.exec(eventName);
      const requestId = text(data?.["id"]);
      if (requestId && eventName && match?.[1])
        this.pending = { requestId, eventName, expansion: match[1], stage: Stage.Response };
      return;
    }
    if (responseId) {
      const pending = this.pending;
      const course = object(data?.["Course"]);
      if (pending?.stage === Stage.Response && responseId === pending.requestId
        && course?.["InternalEventName"] === pending.eventName && course["CurrentModule"] === "PlayerDraft") {
        pending.stage = Stage.Queue;
      } else this.pending = undefined;
      return;
    }
    if (prefix.includes("Client.SceneChange") && this.pending) {
      const pending = this.pending;
      if (pending.stage === Stage.Queue && data?.["fromSceneName"] === "EventLanding"
        && data["toSceneName"] === "TableDraftQueue"
        && data["context"] === `Entering table draft queue: ${pending.expansion}_Premier_Draft`) {
        pending.stage = Stage.Pack;
      } else this.pending = undefined;
    }
  }

  apply(events: NormalizedDraftEvent[]): NormalizedDraftEvent[] {
    return events.map(event => {
      if (event.type !== "DraftPackObserved") {
        // 提示より先に進行を観測した場合も、既存Draftを新規開始と取り違えない。
        if (event.draftId && event.draftId !== this.active?.draftId) this.active = undefined;
        if (event.draftId) this.seenDraftIds.add(event.draftId);
        this.pending = undefined;
        return event;
      }
      if (event.draftId !== this.active?.draftId) this.active = undefined;
      const pending = this.pending;
      if (pending) {
        // CourseIdはDraft IDではない。検証済みの開始順序に限り、一度だけ候補を消費する。
        if (pending.stage === Stage.Pack && event.draftId && !this.seenDraftIds.has(event.draftId)
          && event.packNumber === 0 && event.pickNumber === 0
          && (event.eventName === null || event.eventName === pending.eventName))
          this.active = { draftId: event.draftId, eventName: pending.eventName };
        this.pending = undefined;
      }
      if (event.draftId) this.seenDraftIds.add(event.draftId);
      if (event.eventName !== null) {
        if (event.eventName !== this.active?.eventName) this.active = undefined;
        return event;
      }
      return this.active ? { ...event, eventName: this.active.eventName } : event;
    });
  }
}
