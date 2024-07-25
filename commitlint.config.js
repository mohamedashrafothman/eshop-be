/* eslint-disable no-undef */
/**
 * Following The Conventional Commits specification is a lightweight convention on top of commit messages.
 * It provides an easy set of rules for creating an explicit commit history;
 * which makes it easier to write automated tools on top of.
 * This convention dovetails with SemVer, by describing the features, fixes, and breaking changes made in commit messages.
 * https://www.conventionalcommits.org/
 *
 * The commit message should be structured as follows:
 *
 * <type>[(optional scope)]: <description>
 *
 * [optional body]
 *
 * [optional footer(s)]
 *
 * The commit contains the following structural elements, to communicate intent to the consumers of your library:
 *
 * BREAKING CHANGE: a commit that has a footer BREAKING CHANGE:, or appends a ! after the type/scope, introduces a breaking API change (correlating with MAJOR in semantic versioning). A BREAKING CHANGE can be part of commits of any type.
 * feat: it introduces a new feature to the codebase (this correlates with MINOR in semantic versioning).
 * fix: it patches a bug in your codebase (this correlates with PATCH in semantic versioning)
 * docs: Documentation only changes
 * refactor: A code change that neither fixes a bug nor adds a feature
 * test: Adding missing tests or correcting existing tests
 * style: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
 * build: Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)
 * ci: Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)
 * chore: Changes to the build process or auxiliary tools and libraries such as documentation generation
 * revert: If the commit reverts a previous commit
 * perf: A code change that improves performance
 * wip: work in progress
 */

module.exports = {
	extends: ["@commitlint/config-conventional"],
	rules: {
		"body-leading-blank": [1, "always"],
		"body-max-line-length": [2, "always", 100],
		"footer-leading-blank": [1, "always"],
		"footer-max-line-length": [2, "always", 100],
		"header-max-length": [2, "always", 100],
		"scope-case": [2, "always", "lower-case"],
		"subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
		"subject-empty": [2, "never"],
		"subject-full-stop": [2, "never", "."],
		"type-case": [2, "always", "lower-case"],
		"type-empty": [2, "never"],
		"type-enum": [
			2,
			"always",
			["feat", "fix", "docs", "refactor", "test", "style", "build", "ci", "chore", "revert", "perf", "wip"],
		],
	},
};
