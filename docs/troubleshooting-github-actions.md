# Troubleshooting errors in GitHub Actions while publishing

## Publishing

### Possible errors

> 🦋 error an error occurred while publishing @nl-design-system/my-package: E404 Not Found - PUT [https://registry.npmjs.org/@nl-design-system%2fmy-package](https://registry.npmjs.org/@nl-design-system%2fmy-package) - Not found

- Packages are published with OIDC. Is OIDC configured properly on npmjs.org?
  - the repository name must match
  - the environment must match the environment used in the GitHub Action (case insensitive)
  - the path to the `publish.yml` file must match; double check the extension
- OIDC does not work for the first publish. That needs to be done with an old-fashioned npm token.
- OIDC publishing requires Node 24 - older versions don't work
  - check `.nvmrc` and that `actions/setup-node` uses this
  - npm must be 11.5+ (you can see this in logs, under `actions/setup-node` under Environment details)
- Permissions must contain `id-token: write`
- npm needs to publish with the `--provenance` flag
  - this is either set with `package.json#publishConfig.provenance`, `NPM_CONFIG_PROVENANCE`. or `.npmrc#provenance`
  - pnpm uses npm under the hood so that will work. But older lerna/lerna-lite uses libnpm and that will fail.

> 🦋 error npm notice Access token expired or revoked. Please try logging in again.

Obviously, you can add/refresh the token, but OIDC does not need a token.

- check that OIDC is configured on npmjs.org

### Resources

- [https://docs.npmjs.com/trusted-publishers](https://docs.npmjs.com/trusted-publishers)
- [https://docs.github.com/en/actions/concepts/security/openid-connect](https://docs.github.com/en/actions/concepts/security/openid-connect)

## Git

### Possible errors

> Error: fatal: could not read Username for '[https://github.com](https://github.com/)': terminal prompts disabled

- Check that it is not overridden by an environment variable or secret. `GITHUB_TOKEN` is automatically passed by GitHub Actions with permissions as specified in the workflow file.
