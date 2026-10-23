import { describe, expect, it } from "vitest";
import { parseCreateTask, parseListQuery, parseUpdateTask } from "../src/lib/validate";
import { ValidationError } from "../src/lib/errors";

describe("parseListQuery", () => {
  it("применяет значения по умолчанию", () => {
    const query = parseListQuery(new URLSearchParams(""));
    expect(query.page).toBe(1);
    expect(query.pageSize).toBe(20);
    expect(query.sort).toBe("created_at");
    expect(query.order).toBe("desc");
  });

  it("отклоняет неизвестный статус", () => {
    expect(() => parseListQuery(new URLSearchParams("status=unknown"))).toThrow(ValidationError);
  });

  it("ограничивает pageSize сверху", () => {
    const query = parseListQuery(new URLSearchParams("pageSize=1000"));
    expect(query.pageSize).toBe(100);
  });

  it("нормализует пробелы в поиске", () => {
    const query = parseListQuery(new URLSearchParams("search=%20%20docker%20%20"));
    expect(query.search).toBe("docker");
  });

  it("отклоняет неизвестное поле сортировки", () => {
    expect(() => parseListQuery(new URLSearchParams("sort=id"))).toThrow(ValidationError);
  });
});

describe("parseCreateTask", () => {
  it("применяет дефолты", () => {
    const input = parseCreateTask({ title: "Написать документацию" });
    expect(input.priority).toBe("medium");
    expect(input.assignee).toBe("unassigned");
    expect(input.description).toBe("");
  });

  it("отклоняет слишком короткий title", () => {
    expect(() => parseCreateTask({ title: "ab" })).toThrow(ValidationError);
  });

  it("отклоняет невалидный приоритет", () => {
    expect(() => parseCreateTask({ title: "Нормальный заголовок", priority: "urgent" })).toThrow(ValidationError);
  });

  it("отклоняет не-объект", () => {
    expect(() => parseCreateTask("строка")).toThrow(ValidationError);
  });
});

describe("parseUpdateTask", () => {
  const current = { status: "todo" as const, priority: "medium" as const };

  it("принимает частичное обновление", () => {
    const patch = parseUpdateTask({ status: "done" }, current);
    expect(patch.status).toBe("done");
    expect(patch.title).toBeUndefined();
  });

  it("отклоняет невалидный статус", () => {
    expect(() => parseUpdateTask({ status: "archived" }, current)).toThrow(ValidationError);
  });
});