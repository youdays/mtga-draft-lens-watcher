import { test } from "node:test";
import * as assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLine, PlayerLogParser, ParsedEvent, DraftFormat } from "../src/lib/util/parseLog";

const fixture = (name: string) => readFileSync(join(__dirname, "../fixtures", name), "utf8").trim();
for (const example of JSON.parse(fixture("player-events.json"))) {
  test(`Player.log: ${example.name}`, () => assert.deepEqual(parseLine(example.line), example.expected));
}
for (const [file, type, format, packNumber, pickNumber] of [
  ["pickNextQuick.txt", ParsedEvent.PickNext, DraftFormat.Quick, 1, 1],
  ["pickSubmitQuick.txt", ParsedEvent.PickSubmit, DraftFormat.Quick, 1, 1],
  ["pickNextPremier.txt", ParsedEvent.PickNext, DraftFormat.Premier, 1, 2],
  ["pickSubmitPremier.txt", ParsedEvent.PickSubmit, DraftFormat.Premier, 1, 2],
] as const) {
  test(`Player.logのRPC形式と番号起点: ${file}`, () => {
    const parsed = parseLine(fixture(file));
    assert.notEqual(parsed.type, ParsedEvent.Unknown);
    if (parsed.type === ParsedEvent.Unknown) return;
    assert.equal(parsed.type, type);
    assert.equal(parsed.format, format);
    assert.equal(parsed.packNumber, packNumber);
    assert.equal(parsed.pickNumber, pickNumber);
    if (parsed.type === ParsedEvent.PickSubmit) assert.equal(parsed.pickCard, format === DraftFormat.Quick ? "86719" : "86685");
    else assert.equal(parsed.draftPack.length, format === DraftFormat.Quick ? 14 : 13);
  });
}
test("ヘッダーと本文が別行でも対応し、不正行の後に復帰する", () => {
  const parser = new PlayerLogParser();
  assert.equal(parser.parse('[UnityCrossThreadLogger]==> Event_PlayerDraftMakePick').type, ParsedEvent.Unknown);
  assert.equal(parser.parse('{"Pack":1,"Pick":1,"GrpId":123}').type, ParsedEvent.PickSubmit);
  assert.equal(parser.parse('Draft.Notify {不正JSON}').type, ParsedEvent.Unknown);
  assert.equal(parser.parse(fixture("pickNextPremier.txt")).type, ParsedEvent.PickNext);
});
test("不正JSON・未知イベント・不正なカードと番号を無視する", () => {
  for (const line of [
    'Draft.Notify {', '未知イベント {}', 'Draft.Notify {"SelfPack":1,"SelfPick":1,"PackCards":null}',
    'Draft.Notify {"SelfPack":0,"SelfPick":1,"PackCards":"123"}',
    'Draft.Notify {"SelfPack":1,"SelfPick":1,"PackCards":""}',
    'Draft.Notify {"SelfPack":1,"SelfPick":1,"PackCards":"123,abc"}',
    'BotDraft_DraftStatus {"DraftStatus":"Completed","DraftPack":["123"],"PackNumber":1,"PickNumber":1}',
    'BotDraft_DraftPick {"PickInfo":null}',
  ]) assert.equal(parseLine(line).type, ParsedEvent.Unknown);
});

test("macOSのQuick Draft実ログで全パック・ピックを番号とカードまで照合する", () => {
  const parser = new PlayerLogParser();
  const actual = fixture("quick-player-macos.txt").split("\n")
    .map(line => parser.parse(line)).filter(event => event.type !== ParsedEvent.Unknown);
  const expected = JSON.parse(fixture("quick-player-macos.expected.json"));
  assert.ok(expected.some((event: { type: string; packNumber: number; pickNumber: number }) => event.type === ParsedEvent.PickSubmit && event.packNumber === 1 && event.pickNumber === 1));
  assert.deepEqual(actual, expected);
});

test("現行Quickの別行ヘッダーと単一CardIdsに対応し、複数枚は読み飛ばす", () => {
  const parser = new PlayerLogParser();
  parser.parse('<== BotDraftDraftPick(anonymous)');
  assert.deepEqual(parser.parse('{"PickInfo":{"PackNumber":0,"PickNumber":0,"CardIds":["123"]}}'), {
    type: ParsedEvent.PickSubmit, format: DraftFormat.Quick, packNumber: 1, pickNumber: 1, pickCard: "123",
  });
  for (const cards of [[], ["123", "456"], null, "123"]) {
    assert.equal(parseLine('==> BotDraftDraftPick ' + JSON.stringify({ PickInfo: { PackNumber: 0, PickNumber: 0, CardIds: cards } })).type, ParsedEvent.Unknown);
  }
});
