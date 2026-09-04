/**
 * The renderer and the number parser are plain TypeScript with no Medusa in
 * them, which is the point: they can be tested in a second without a database,
 * a Redis or an event bus anywhere near them.
 */
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.[jt]s$": ["@swc/jest", { jsc: { target: "es2021" } }],
  },
  moduleFileExtensions: ["js", "ts", "json"],
  testMatch: ["<rootDir>/tests/**/*.test.ts"],
  modulePathIgnorePatterns: ["<rootDir>/.medusa/"],
}
