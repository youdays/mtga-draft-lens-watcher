export type DraftState = {
  draftId: string | null;
  eventName: string | null;
  currentPickedCardIds: number[];
  observations: PickObservation[];
};
export type PickObservation = {
  packNumber: number;
  pickNumber: number;
  packCardIds: number[];
  pickedCardIds: number[] | null;
};
type Position = { draftId: string | null; packNumber: number; pickNumber: number };
export type NormalizedDraftEvent =
  | (Position & { type: "DraftPackObserved"; eventName: string | null; packCardIds: number[] })
  | (Position & { type: "PickObserved"; pickedCardIds: number[] })
  | { type: "PickedCardsSnapshotObserved"; draftId: string | null; pickedCardIds: number[] };
export const emptyDraftState = (): DraftState => ({ draftId: null, eventName: null, currentPickedCardIds: [], observations: [] });
export const draftStateEnvelope = (data: DraftState) => ({ type: "draftState" as const, schemaVersion: 1 as const, data });
