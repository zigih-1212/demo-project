import { ValidationError } from "./errors";

/**
 * Парсинг JSON-тела запроса с единообразными ошибками.
 *
 * Массив — не объект запроса: `typeof [] === "object"`, поэтому явная
 * проверка Array.isArray обязательна, иначе массив проходит дальше и
 * падает на доступе к полям (или хуже — молча игнорируется).
 */
export async function parseJsonBody(c: {
  req: { json: () => Promise<unknown> };
}): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ValidationError("Тело запроса должно быть корректным JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ValidationError("Тело запроса должно быть объектом");
  }
  return body as Record<string, unknown>;
}
