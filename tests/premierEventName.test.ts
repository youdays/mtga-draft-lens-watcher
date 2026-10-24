import { test } from "node:test";
import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PlayerLogAdapter } from "../src/lib/adapters/PlayerLogAdapter";
import { DraftStateReducer } from "../src/lib/draft/DraftStateReducer";
import type { NormalizedDraftEvent } from "../src/lib/draft/types";

const eventName = "PremierDraft_FRA_20260929";
const request = (name = eventName, id = "request") => `==> EventJoin ${JSON.stringify({ id, request: JSON.stringify({ EventName: name }) })}`;
const response = (name = eventName, module = "PlayerDraft") => JSON.stringify({ Course: { CourseId: "course-is-not-draft", InternalEventName: name, CurrentModule: module, ModulePayload: "" } });
const queue = (set = "FRA", target = "TableDraftQueue") => `Client.SceneChange ${JSON.stringify({ fromSceneName: "EventLanding", toSceneName: target, context: `Entering table draft queue: ${set}_Premier_Draft` })}`;
const pack = (draftId = "draft", pick = 1, name?: string) => `Draft.Notify ${JSON.stringify({ draftId, SelfPack: 1, SelfPick: pick, PackCards: "106511,106512", ...(name ? { EventName: name } : {}) })}`;
const prepare = (adapter: PlayerLogAdapter) => [request(), "<== EventJoin(request)", response(), queue()].forEach(line => adapter.parse(line));
const nameOf = (adapter: PlayerLogAdapter, line = pack()) => {
  const event = adapter.parse(line)[0];
  assert.equal(event?.type, "DraftPackObserved");
  return event?.type === "DraftPackObserved" ? event.eventName : undefined;
};

test("匿名化したFRA実ログの全42提示・42Pickを保ち、最初の提示から形式を確定する", () => {
  const adapter = new PlayerLogAdapter();
  const events = readFileSync(join(__dirname, "../fixtures/premier-fra-event-name.txt"), "utf8").split("\n").flatMap(line => adapter.parse(line));
  const packs = events.filter((e): e is Extract<NormalizedDraftEvent, { type: "DraftPackObserved" }> => e.type === "DraftPackObserved");
  assert.equal(packs.length, 42);
  assert.equal(events.filter(e => e.type === "PickObserved").length, 42);
  assert.ok(packs.every(e => e.eventName === eventName));
  const reducer = new DraftStateReducer();
  for (const event of events) reducer.reduce(event);
  assert.equal(reducer.getState().eventName, eventName);
  assert.equal(reducer.getState().observations.length, 42);
  assert.equal(reducer.getState().currentPickedCardIds.length, 42);
});

test("参加応答のRPC ID・イベント名・開始モジュール・待機セットが一致した場合だけ補完する", () => {
  const cases = [
    [request(), "<== EventJoin(other)", response(), queue()],
    [request(), "<== EventJoin(request)", response("PremierDraft_HOB_TEST"), queue()],
    [request(), "<== EventJoin(request)", response(eventName, "CreateMatch"), queue()],
    [request(), "<== EventJoin(request)", '{"error":"参加失敗"}', queue()],
    [request(), "<== EventJoin(request)", response(), queue("HOB")],
    [request(), "<== EventJoin(request)", response(), queue("FRA", "Home")],
    [request(), queue()],
    ["<== EventJoin(request)", response(), queue()],
    [request(), "<== EventJoin(request)", response()],
    [request("TradDraft_FRA_TEST"), "<== EventJoin(request)", response("TradDraft_FRA_TEST"), queue()],
    [request("PremierDraft_FRA_Cube"), "<== EventJoin(request)", response("PremierDraft_FRA_Cube"), queue()],
  ];
  for (const lines of cases) {
    const adapter = new PlayerLogAdapter();
    lines.forEach(line => adapter.parse(line));
    assert.equal(nameOf(adapter), null);
  }
});

test("途中起動・P1P1欠落・既に観測したDraftには候補を割り当てず、次Draftにも使い回さない", () => {
  const adapter = new PlayerLogAdapter();
  assert.equal(nameOf(adapter), null);
  prepare(adapter);
  assert.equal(nameOf(adapter), null);
  prepare(adapter);
  assert.equal(nameOf(adapter, pack("next", 2)), null);
  assert.equal(nameOf(adapter, pack("next", 1)), null);
  prepare(adapter);
  assert.equal(nameOf(adapter, pack("new")), eventName);
  assert.equal(nameOf(adapter, pack("new", 2)), eventName);
  assert.equal(nameOf(adapter, pack("another")), null);
  assert.equal(nameOf(adapter, pack("new", 3)), null);
});

test("別の参加要求・不正JSON・別画面への遷移で候補を破棄する", () => {
  for (const interrupt of [request("QuickDraft_FRA_TEST"), "未知イベント {不正JSON}", queue("FRA", "Home")]) {
    const adapter = new PlayerLogAdapter(); prepare(adapter);
    assert.doesNotThrow(() => adapter.parse(interrupt));
    assert.equal(nameOf(adapter), null);
  }
});

test("パック内の明示イベント名を優先し、補完名で上書きしない", () => {
  const adapter = new PlayerLogAdapter(); prepare(adapter);
  assert.equal(nameOf(adapter, pack("draft", 1, "TradDraft_FRA_TEST")), "TradDraft_FRA_TEST");
  assert.equal(nameOf(adapter, pack("draft", 2)), null);
  prepare(adapter);
  assert.equal(nameOf(adapter, pack("new")), eventName);
  assert.equal(nameOf(adapter, pack("new", 2, "PremierDraft_HOB_TEST")), "PremierDraft_HOB_TEST");
  assert.equal(nameOf(adapter, pack("new", 3)), null);
});

test("ログ再作成後の新しいAdapterに候補・Draft対応を持ち越さない", () => {
  const adapter = new PlayerLogAdapter(); prepare(adapter);
  assert.equal(nameOf(adapter), eventName);
  assert.equal(nameOf(new PlayerLogAdapter(), pack("draft", 2)), null);
});

test("同じ行の参加応答を読めるが、Draft ID欠落やQuick提示は候補を消費して補完しない", () => {
  const adapter = new PlayerLogAdapter();
  adapter.parse(request());
  adapter.parse(`<== EventJoin(request) ${response()}`);
  adapter.parse(queue());
  assert.equal(nameOf(adapter), eventName);
  const missing = new PlayerLogAdapter(); prepare(missing);
  assert.equal(nameOf(missing, 'Draft.Notify {"SelfPack":1,"SelfPick":1,"PackCards":"106511"}'), null);
  assert.equal(nameOf(missing), null);
  const quick = new PlayerLogAdapter(); prepare(quick);
  quick.parse('BotDraft_DraftStatus {"DraftStatus":"PickNext","PackNumber":0,"PickNumber":0,"DraftPack":[106511],"PickedCards":[]}');
  assert.equal(nameOf(quick), null);
  const picked = new PlayerLogAdapter(); prepare(picked);
  picked.parse(`==> EventPlayerDraftMakePick ${JSON.stringify({ request: JSON.stringify({ DraftId: "draft", Pack: 1, Pick: 1, GrpIds: [106511] }) })}`);
  assert.equal(nameOf(picked), null);
});
