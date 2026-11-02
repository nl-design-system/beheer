# CLI package preferences

Preferred maintained packages for common npm script CLIs.
When auditing or updating a repo, align to these unless there is a documented exception.

## Copy files: `cpy-cli`

Use **`cpy-cli`**.
Do not use `cpy`, `cpy2`, or custom copy scripts.

| Avoid                                            | Prefer    |
| ------------------------------------------------ | --------- |
| `cpy`                                            | `cpy-cli` |
| `cpy2`                                           | `cpy-cli` |
| custom `cp` / Node copy scripts for the same job | `cpy-cli` |

The binary remains `cpy` when the dependency is `cpy-cli`:

```json
{
  "scripts": {
    "build:copy": "cpy \"src/**/*.css\" dist/"
  },
  "devDependencies": {
    "cpy-cli": "..."
  }
}
```

When migrating: replace the dependency name, keep script invocations as `cpy ...`, then reinstall and verify copy scripts still work.

## Clean / delete: `rimraf`

Use `rimraf` for cleaning build output and similar delete jobs in npm scripts.
Prefer the package CLI over ad-hoc `rm -rf` in cross-platform scripts.

```json
{
  "scripts": {
    "clean": "rimraf dist"
  },
  "devDependencies": {
    "rimraf": "…"
  }
}
```

## Script orchestration: `npm-run-all2`

Use `npm-run-all2` instead of `npm-run-all`.
Prefer the shorthand binaries:

| Prefer  | Meaning                 |
| ------- | ----------------------- |
| `run-p` | run scripts in parallel |
| `run-s` | run scripts in sequence |

Avoid spelling out `npm-run-all` / `npm-run-all2` in scripts when `run-p` or `run-s` is enough.

```json
{
  "scripts": {
    "build": "run-s clean build:js build:css",
    "test": "run-p test:unit test:lint"
  },
  "devDependencies": {
    "npm-run-all2": "..."
  }
}
```

When migrating from `npm-run-all`: swap the dependency to `npm-run-all2`, prefer rewriting long `npm-run-all --parallel` / `--sequential` invocations to `run-p` / `run-s`, reinstall, and verify the orchestrated scripts.
