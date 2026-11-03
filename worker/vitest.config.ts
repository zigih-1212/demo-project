import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Логин хеширует пароль PBKDF2-100k (~1.2 с в workerd); beforeAll
    // собирает бандл esbuild и поднимает изолят — нужны запасы по таймаутам.
    testTimeout: 60_000,
    hookTimeout: 180_000,
  },
});
