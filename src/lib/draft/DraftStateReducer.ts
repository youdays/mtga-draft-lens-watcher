import { DraftState, NormalizedDraftEvent, emptyDraftState } from "./types";

/** Arena形式に依存しない、起動中の観測事実のSource of Truth。 */
export class DraftStateReducer {
  private state = emptyDraftState();
  // Observationを再走査せず、重複PickをPoolへ二重加算しないための寄与を保持する。
  private picks = new Map<string, number[]>();
  private snapshotPicks = new Set<string>();

  getState(): DraftState { return structuredClone(this.state); }

  reduce(event: NormalizedDraftEvent): DraftState {
    let newDraft = event.draftId !== null && event.draftId !== this.state.draftId;
    if (event.type === "DraftPackObserved" && event.draftId === null && event.packNumber === 0 && event.pickNumber === 0) {
      const first = this.state.observations.find(o => o.packNumber === 0 && o.pickNumber === 0);
      const progressed = this.state.observations.some(o => o.packNumber > 0 || o.pickNumber > 0)
        || [...this.picks.keys()].some(key => key !== "0:0");
      if (first && progressed && JSON.stringify(first.packCardIds) !== JSON.stringify(event.packCardIds)) newDraft = true;
    }
    if (newDraft) {
      this.state = emptyDraftState();
      this.state.draftId = event.draftId;
      this.picks.clear();
      this.snapshotPicks.clear();
    }
    if (event.type === "PickedCardsSnapshotObserved") {
      // 累積SnapshotをPrimary Sourceにし、それ以前のPick寄与を置き換える。
      this.snapshotPicks = new Set(this.picks.keys());
      this.state.currentPickedCardIds = [...event.pickedCardIds];
    } else {
      const key = `${event.packNumber}:${event.pickNumber}`;
      const observation = this.state.observations.find(o => o.packNumber === event.packNumber && o.pickNumber === event.pickNumber);
      if (event.type === "DraftPackObserved") {
        if (event.eventName !== null) this.state.eventName = event.eventName;
        if (observation) {
          observation.packCardIds = [...event.packCardIds];
          observation.pickedCardIds = null;
        } else this.state.observations.push({ packNumber: event.packNumber, pickNumber: event.pickNumber, packCardIds: [...event.packCardIds], pickedCardIds: null });
      } else {
        // Pack未観測のPickでもPoolを保持するが、架空のObservationは作らない。
        if (observation) observation.pickedCardIds = [...event.pickedCardIds];
        const previous = this.picks.get(key);
        if (JSON.stringify(previous) === JSON.stringify(event.pickedCardIds)) return this.getState();
        if (previous && !this.snapshotPicks.has(key)) for (const card of previous) {
          const index = this.state.currentPickedCardIds.lastIndexOf(card);
          if (index >= 0) this.state.currentPickedCardIds.splice(index, 1);
        }
        this.picks.set(key, [...event.pickedCardIds]);
        if (!this.snapshotPicks.has(key)) this.state.currentPickedCardIds.push(...event.pickedCardIds);
      }
    }
    return this.getState();
  }
}
