import { describe, expect, test } from "bun:test";
import {
  findAll,
  findJsonRpcResponse,
  firstUrl,
  isUuid,
  parseJsonText,
  parseSseData,
  readToolResult,
} from "../../src/lib/katana/mcp";

describe("parseSseData", () => {
  test("reads each event's data, joining multi-line data and skipping comments", () => {
    const body = [
      ": keep-alive",
      "event: message",
      'data: {"a":1}',
      "",
      "id: 2",
      "data: line one",
      "data: line two",
      "",
    ].join("\n");
    expect(parseSseData(body)).toEqual(['{"a":1}', "line one\nline two"]);
  });

  test("handles CRLF line endings and a final event without a blank line", () => {
    expect(parseSseData('data: {"x":true}\r\n\r\ndata:last')).toEqual(['{"x":true}', "last"]);
  });
});

describe("findJsonRpcResponse", () => {
  test("reads a plain JSON answer", () => {
    const answer = findJsonRpcResponse(
      '{"jsonrpc":"2.0","id":3,"result":{"ok":true}}',
      "application/json",
      3,
    );
    expect(answer?.result).toEqual({ ok: true });
  });

  test("finds the answer after notifications in an event stream", () => {
    const body = [
      'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":1}}',
      "",
      'data: {"jsonrpc":"2.0","id":7,"result":{"content":[]}}',
      "",
    ].join("\n");
    expect(findJsonRpcResponse(body, "text/event-stream; charset=utf-8", 7)?.result).toEqual({
      content: [],
    });
  });

  test("reads errors and ignores answers to other requests", () => {
    const body =
      '[{"jsonrpc":"2.0","id":1,"result":{}},{"jsonrpc":"2.0","id":2,"error":{"code":-32602,"message":"bad"}}]';
    const answer = findJsonRpcResponse(body, "application/json", 2);
    expect(answer?.error).toEqual({ code: -32602, message: "bad" });
    expect(findJsonRpcResponse(body, "application/json", 9)).toBeNull();
  });

  test("returns null for a body that isn't JSON", () => {
    expect(findJsonRpcResponse("<html>", "text/html", 1)).toBeNull();
  });
});

describe("readToolResult", () => {
  test("prefers structured content", () => {
    const result = readToolResult({
      content: [{ type: "text", text: "Imported" }],
      structuredContent: { media_id: "abc" },
    });
    expect(result).toEqual({ payload: { media_id: "abc" }, text: "Imported", isError: false });
  });

  test("reads JSON text when there is no structured content", () => {
    const result = readToolResult({
      content: [{ type: "text", text: '{"cost":{"credits_exact":12.5}}' }],
    });
    expect(result.payload).toEqual({ cost: { credits_exact: 12.5 } });
  });

  test("keeps plain text and the error flag", () => {
    const result = readToolResult({
      content: [{ type: "text", text: "Rate limit reached" }],
      isError: true,
    });
    expect(result).toEqual({ payload: null, text: "Rate limit reached", isError: true });
  });
});

describe("helpers", () => {
  test("parseJsonText only parses objects and arrays", () => {
    expect(parseJsonText(" [1,2] ")).toEqual([1, 2]);
    expect(parseJsonText("12")).toBeNull();
    expect(parseJsonText("{broken")).toBeNull();
  });

  test("findAll walks nested objects and arrays", () => {
    expect(findAll({ a: { id: 1, b: [{ id: 2 }, { c: { id: 3 } }] } }, "id")).toEqual([1, 2, 3]);
  });

  test("firstUrl returns the first https URL under the keys", () => {
    expect(firstUrl({ upload: { upload_url: "https://up.example/x" } }, ["upload_url"])).toBe(
      "https://up.example/x",
    );
    expect(firstUrl({ upload_url: "http://insecure" }, ["upload_url"])).toBeNull();
  });

  test("isUuid", () => {
    expect(isUuid("df2f0abc-0427-4898-b60a-e01708473e83")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
  });
});
