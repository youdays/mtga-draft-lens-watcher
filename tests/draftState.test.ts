import { test } from "node:test";
import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PlayerLogAdapter } from "../src/lib/adapters/PlayerLogAdapter";
import { DraftStateReducer } from "../src/lib/draft/DraftStateReducer";
import { NormalizedDraftEvent, draftStateEnvelope, emptyDraftState } from "../src/lib/draft/types";

const pack = (pickNumber = 0, packCardIds = [1, 2], draftId: string | null = null): Extract<NormalizedDraftEvent, { type: "DraftPackObserved" }> => ({ type: "DraftPackObserved", draftId, eventName: null, packNumber: 0, pickNumber, packCardIds });
const pick = (pickNumber = 0, pickedCardIds = [1], draftId: string | null = null): NormalizedDraftEvent => ({ type: "PickObserved", draftId, packNumber: 0, pickNumber, pickedCardIds });
const snapshot = (pickedCardIds: number[]): NormalizedDraftEvent => ({ type: "PickedCardsSnapshotObserved", draftId: null, pickedCardIds });
function fixture(name: string) {
  const adapter = new PlayerLogAdapter();
  return readFileSync(join(__dirname, "../fixtures", name), "utf8").split("\n").flatMap(line => adapter.parse(line));
}

for (const [name, id, first, next, chosen] of [
  ["v2-quick.txt", null, [103522,103564,103461,103413,103470,103519,103441,103542,103390,103536,103500,103426,103504,103570], [103501,103405,103457,103522,103377,103479,103490,103542,103442,103416,103395,103523,103570], 103390],
  ["v2-premier.txt", "draft-anonymous", [86685,86719], [86719], 86685],
] as const) {
  test(`Player.log → Adapter → Normalized Events → Reducer: ${name}`, () => {
    const events = fixture(name);
    assert.equal(events.length, 3);
    assert.deepEqual(events.map(e => e.type), ["DraftPackObserved", "PickObserved", "DraftPackObserved"]);
    const reducer = new DraftStateReducer();
    assert.deepEqual(reducer.reduce(events[0]!), { draftId: id, eventName: null, currentPickedCardIds: [], observations: [{ packNumber: 0, pickNumber: 0, packCardIds: first, pickedCardIds: null }] });
    const afterPick = reducer.reduce(events[1]!);
    assert.equal(afterPick.observations.length, 1);
    assert.deepEqual(afterPick.observations[0]!.pickedCardIds, [chosen]);
    assert.deepEqual(reducer.reduce(events[2]!), { draftId: id, eventName: null, currentPickedCardIds: [chosen], observations: [
      { packNumber: 0, pickNumber: 0, packCardIds: first, pickedCardIds: [chosen] },
      { packNumber: 0, pickNumber: 1, packCardIds: next, pickedCardIds: null },
    ] });
  });
}

test("同一キーのLWW、duplicate Pickの二重加算防止、複数枚・同一カードの累積", () => {
  const reducer = new DraftStateReducer();
  reducer.reduce(pack());
  reducer.reduce(pick());
  reducer.reduce(pack(1));
  reducer.reduce(pick(1, [1, 2]));
  const state = reducer.getState();
  assert.deepEqual(reducer.reduce(pick()), state);
  reducer.reduce(pick(1, [3, 3]));
  assert.deepEqual(reducer.getState().currentPickedCardIds, [1, 3, 3]);
  assert.deepEqual(reducer.reduce(pack(1, [4])).observations[1], { packNumber: 0, pickNumber: 1, packCardIds: [4], pickedCardIds: null });
  assert.deepEqual(reducer.getState().currentPickedCardIds, [1, 3, 3]);
});

test("Quick SnapshotはPrimary Source、再送済みPickはSnapshotに二重加算しない", () => {
  const reducer = new DraftStateReducer();
  reducer.reduce(pack()); reducer.reduce(pick());
  reducer.reduce(snapshot([9, 1]));
  reducer.reduce(pick());
  assert.deepEqual(reducer.getState().currentPickedCardIds, [9, 1]);
  reducer.reduce(pick(1, [2]));
  assert.deepEqual(reducer.getState().currentPickedCardIds, [9, 1, 2]);
  reducer.reduce(snapshot([9, 1, 2])); reducer.reduce(pick(1, [2]));
  assert.deepEqual(reducer.getState().currentPickedCardIds, [9, 1, 2]);
  reducer.reduce(snapshot([]));
  assert.deepEqual(reducer.getState().currentPickedCardIds, []);
});

test("draft instance ID変更で全StateとPool寄与をリセットしCourseIdは無視する", () => {
  const reducer = new DraftStateReducer();
  reducer.reduce({ ...pack(0, [1], "a"), eventName: "observed-event" }); reducer.reduce(pick(0, [1], "a"));
  assert.deepEqual(reducer.reduce(pack(0, [2], "b")), { draftId: "b", eventName: null, currentPickedCardIds: [], observations: [{ packNumber: 0, pickNumber: 0, packCardIds: [2], pickedCardIds: null }] });
  const adapter = new PlayerLogAdapter();
  assert.deepEqual(adapter.parse('DraftCompleteDraft {"CourseId":"different-id"}'), []);
  assert.equal(reducer.getState().draftId, "b");
});

test("Quickの進行済みP1P1と異なるPackだけで新Draft。同じPackの再送は維持", () => {
  const reducer = new DraftStateReducer();
  reducer.reduce(pack()); reducer.reduce(pick());
  reducer.reduce(pack(0, [3])); // 先のPick未観測なら境界にはしない。
  assert.deepEqual(reducer.getState().currentPickedCardIds, [1]);
  reducer.reduce(pack(1));
  const duplicate = reducer.reduce(pack(0, [3]));
  assert.equal(duplicate.observations.length, 2);
  assert.deepEqual(duplicate.currentPickedCardIds, [1]);
  assert.deepEqual(reducer.reduce(pack(0, [4])), { draftId: null, eventName: null, currentPickedCardIds: [], observations: [{ packNumber: 0, pickNumber: 0, packCardIds: [4], pickedCardIds: null }] });
});

test("部分欠損時のPickはPoolに保持し、Packなし・responseのみではObservationを作らない", () => {
  const reducer = new DraftStateReducer();
  reducer.reduce(pick(2, [7]));
  assert.deepEqual(reducer.getState().observations, []);
  assert.deepEqual(reducer.getState().currentPickedCardIds, [7]);
  const adapter = new PlayerLogAdapter();
  assert.deepEqual(adapter.parse('EventPlayerDraftMakePick {"Result":"Success"}'), []);
  reducer.reduce(pack(3));
  assert.equal(reducer.getState().observations.length, 1);
});

test("Quickの累積PickedCardsと新Draft Packは境界判定後にSnapshotを適用", () => {
  const reducer = new DraftStateReducer();
  reducer.reduce(pack()); reducer.reduce(pack(1));
  const adapter = new PlayerLogAdapter();
  const events = adapter.parse('BotDraftDraftStatus {"PackNumber":0,"PickNumber":0,"DraftPack":["8"],"PickedCards":["9"],"EventName":"Quick_TEST"}');
  assert.deepEqual(events.map(e => e.type), ["DraftPackObserved", "PickedCardsSnapshotObserved"]);
  for (const event of events) reducer.reduce(event);
  assert.deepEqual(reducer.getState(), { draftId: null, eventName: "Quick_TEST", currentPickedCardIds: [9], observations: [{ packNumber: 0, pickNumber: 0, packCardIds: [8], pickedCardIds: null }] });
});

test("Quick/Premier複数枚Pick、旧Premier/Traditional、0-based P2P3と明示eventName", () => {
  const adapter = new PlayerLogAdapter();
  assert.deepEqual(adapter.parse('BotDraft_DraftPick {"PickInfo":{"PackNumber":1,"PickNumber":2,"CardIds":["1","2"]}}'), [ { type: "PickObserved", draftId: null, packNumber: 1, pickNumber: 2, pickedCardIds: [1, 2] } ]);
  assert.deepEqual(adapter.parse('EventPlayerDraftMakePick {"DraftId":"a","Pack":2,"Pick":3,"GrpIds":[1,2]}'), [ { type: "PickObserved", draftId: "a", packNumber: 1, pickNumber: 2, pickedCardIds: [1, 2] } ]);
  assert.deepEqual(adapter.parse('Event_PlayerDraftStart {"EventName":"TradDraft_TEST","PackNumber":2,"PickNumber":3,"CardsInPack":["1",2]}'), [ { type: "DraftPackObserved", draftId: null, eventName: "TradDraft_TEST", packNumber: 1, pickNumber: 2, packCardIds: [1, 2] } ]);
});

test("不正・未知ログを無視し別行ヘッダーから復帰", () => {
  const adapter = new PlayerLogAdapter();
  for (const line of ['Draft.Notify {', 'Unknown {}', 'Draft.Notify {"SelfPack":0,"SelfPick":1,"PackCards":"1"}', 'BotDraftDraftPick {"PickInfo":{"PackNumber":0,"PickNumber":0,"CardIds":["bad"]}}']) assert.deepEqual(adapter.parse(line), []);
  adapter.parse('==> EventPlayerDraftMakePick');
  assert.deepEqual(adapter.parse('{"DraftId":"a","Pack":1,"Pick":1,"GrpIds":[1]}'), [pick(0, [1], "a")]);
});

test("全量Envelope schemaVersion 1、返却Stateと入力配列から内部Stateを変更できない", () => {
  const reducer = new DraftStateReducer();
  const event = pack();
  const state = reducer.reduce(event);
  state.observations[0]!.packCardIds.push(99);
  if (event.type === "DraftPackObserved") event.packCardIds.push(88);
  assert.deepEqual(reducer.getState().observations[0]!.packCardIds, [1, 2]);
  assert.deepEqual(draftStateEnvelope(emptyDraftState()), { type: "draftState", schemaVersion: 1, data: { draftId: null, eventName: null, currentPickedCardIds: [], observations: [] } });
});

test("既存RPC Quick/Premier fixtureも0-basedの正規化イベントになる", () => {
  for (const [file, type, packNumber, pickNumber] of [
    ["pickNextQuick.txt", "DraftPackObserved", 0, 0],
    ["pickSubmitQuick.txt", "PickObserved", 0, 0],
    ["pickNextPremier.txt", "DraftPackObserved", 0, 1],
    ["pickSubmitPremier.txt", "PickObserved", 0, 1],
  ] as const) {
    const events = fixture(file);
    assert.equal(events.length, file === "pickNextQuick.txt" ? 2 : 1);
    if (file === "pickNextQuick.txt") assert.deepEqual(events[1], snapshot([]));
    const event = events[0]!;
    assert.equal(event.type, type);
    assert.equal(event.packNumber, packNumber);
    assert.equal(event.pickNumber, pickNumber);
  }
});

test("Quick全42Pickの実ログfixtureをv2経路で照合", () => {
  const reducer = new DraftStateReducer();
  for (const event of fixture("quick-player-macos.txt")) reducer.reduce(event);
  const expected = JSON.parse(readFileSync(join(__dirname, "../fixtures/quick-player-macos.expected.json"), "utf8")) as { type: string; packNumber: number; pickNumber: number; draftPack?: string[]; pickCard?: string }[];
  const packs = expected.filter(e => e.type === "PickNext");
  const picks = expected.filter(e => e.type === "PickSubmit");
  assert.deepEqual(reducer.getState(), {
    draftId: null, eventName: null,
    currentPickedCardIds: picks.map(e => Number(e.pickCard)),
    observations: packs.map(e => ({ packNumber: e.packNumber - 1, pickNumber: e.pickNumber - 1, packCardIds: e.draftPack!.map(Number), pickedCardIds: [Number(picks.find(p => p.packNumber === e.packNumber && p.pickNumber === e.pickNumber)!.pickCard)] })),
  });
});

test("Pack欠損でもP1P1より先のPickが観測されたらQuick境界判定に反映", () => {
  const reducer = new DraftStateReducer();
  reducer.reduce(pack()); reducer.reduce(pick(2));
  assert.equal(reducer.reduce(pack(0, [9])).observations.length, 1);
  assert.deepEqual(reducer.getState().currentPickedCardIds, []);
});
