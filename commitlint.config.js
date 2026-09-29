/**
 * @type {import('@commitlint/types').UserConfig}
 */
const config = {
   extends: ["@commitlint/config-conventional"],
   rules: {
      "scope-empty": [2, "never"],
      "scope-case": [2, "always", "lower-case"],
      "scope-enum": [0], // Disable the enum rule since we'll use a custom rule
      "subject-case": [2, "never", ["pascal-case", "upper-case"]],
      "subject-empty": [2, "never"],
      "subject-full-stop": [2, "never", "."],
      "type-case": [2, "always", "lower-case"],
      "type-empty": [2, "never"],
      "type-enum": [
         2,
         "always",
         ["fix", "feat", "docs", "style", "refactor", "perf", "test", "build", "ci", "chore"],
      ],
      "body-max-line-length": [0],
   },
};

export default config;
