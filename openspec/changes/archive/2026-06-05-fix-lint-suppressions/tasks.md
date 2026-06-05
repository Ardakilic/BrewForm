## 1. Remove unnecessary `as any` casts in `user/service.ts`

- [x] 1.1 Open `apps/api/src/modules/user/service.ts` and confirm the three identical patterns at lines 21-22, 37-38, 66-67 (each: `// deno-lint-ignore no-explicit-any` followed by `const { passwordHash, ...safe } = user as any;`)
- [x] 1.2 Delete the `// deno-lint-ignore no-explicit-any` comment and the `as any` cast on line 21-22 (`getProfile` function). The line should become: `const { passwordHash: _passwordHash, ...safe } = user;`
- [x] 1.3 Delete the `// deno-lint-ignore no-explicit-any` comment and the `as any` cast on line 37-38 (`getPublicProfile` function). The line should become: `const { passwordHash: _passwordHash, email: _email, ...safe } = user;`
- [x] 1.4 Delete the `// deno-lint-ignore no-explicit-any` comment and the `as any` cast on line 66-67 (`updateProfile` function). The line should become: `const { passwordHash: _passwordHash, ...safe } = user;`
- [x] 1.5 Run `deno check apps/api/src/modules/user/service.ts` to confirm the file type-checks with zero `as any` and zero `deno-lint-ignore` directives
- [x] 1.6 Confirm the top-level file docblock (lines 1-7) and all per-function JSDoc blocks are preserved unchanged

## 2. Normalise test file suppressions to file-level

- [x] 2.1 Update `apps/api/src/modules/recipe/service.test.ts`: remove the 1 inline `// deno-lint-ignore no-explicit-any` at line 393; add `// deno-lint-ignore-file no-explicit-any` on line 1, followed by a blank line on line 2, then the existing content from line 3 onward
- [x] 2.2 Update `apps/api/src/modules/user/service.exploration.test.ts`: remove the 2 inline `// deno-lint-ignore no-explicit-any` at lines 87 and 117; add `// deno-lint-ignore-file no-explicit-any` on line 1, followed by a blank line on line 2, then the existing content from line 3 onward
- [x] 2.3 Update `apps/api/src/modules/user/service.preservation.test.ts`: remove the 2 inline `// deno-lint-ignore no-explicit-any` at lines 79 and 109; add `// deno-lint-ignore-file no-explicit-any` on line 1, followed by a blank line on line 2, then the existing content from line 3 onward
- [x] 2.4 Update `apps/api/src/modules/recipe/service.preservation.test.ts`: remove all 6 inline `// deno-lint-ignore no-explicit-any` directives at lines 80, 83, 99, 101, 160, 181 (including the 2 trailing-comment-style directives at lines 160 and 181 — remove only the trailing comment, keep the `as any` cast); add `// deno-lint-ignore-file no-explicit-any` on line 1, followed by a blank line on line 2, then the existing content from line 3 onward
- [x] 2.5 Confirm `apps/api/src/middleware/crawler.test.ts` and `apps/api/src/routes/sitemap.test.ts` are NOT modified (they already use the file-level form on line 1)

## 3. Verification

- [x] 3.1 Run `make fmt` to normalise formatting
- [x] 3.2 Run `make fmt-check` to confirm formatting is clean
- [x] 3.3 Run `make check` to confirm all four workspaces (api, web, db, shared) type-check with zero errors
- [x] 3.4 Run `make lint` to confirm zero new warnings and that the file count is unchanged (395 files)
- [x] 3.5 Run `make test` to confirm all tests pass
- [x] 3.6 Verify directive count: run `grep -rn "deno-lint-ignore" --include="*.ts" apps/ packages/ | wc -l` and confirm the result is **12** (down from 22). 8 file-level on production files are unchanged; 4 new file-level on test files; 0 inline; total = 8 + 4 = 12
- [x] 3.7 Run `openspec list --json` to confirm the change `fix-lint-suppressions` shows all artifacts `done` and `applyRequires` is satisfied
