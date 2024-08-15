import { spyOn } from "bun:test";

spyOn(console, "log");
spyOn(console, "error");

export default {
  file: "src/**/*.test.ts",
  preload: ["setupTests.ts"],
};
