#!/usr/bin/env bash
set -euo pipefail

# better-auth's Nest adapter detects express via an aliased `require$1("express")`
# call that bundlers can't statically analyze, so express silently drops out of
# the deployed bundle. Rewrite it to a literal require() so Bun inlines it.
for f in $(find ../../node_modules -path "*@thallesp/nestjs-better-auth/dist/index.mjs" 2>/dev/null); do
  sed -i.bak 's/require\$1("express")/require("express")/' "$f" && rm -f "$f.bak"
done

# better-call's HideStackFramesError uses a private class field (#hiddenStack).
# Bundling it into the single-file output breaks its constructor's `super()`
# call ordering (ReferenceError: Must call super constructor...), and it's used
# by every Better Auth redirect — including the OAuth callback's success path,
# so every Google sign-in crashed after actually completing the token exchange.
# Rewriting it to a plain (non-private) property sidesteps the bundler bug.
for f in $(find ../../node_modules -path "*better-call/dist/error.mjs" -o -path "*better-call/dist/error.cjs" 2>/dev/null); do
  sed -i.bak 's/#hiddenStack/_hiddenStack/g' "$f" && rm -f "$f.bak"
done

bun build api/index.ts \
  --target=node \
  --outfile=api/index.bundle.js \
  --external=@nestjs/microservices \
  --external=@nestjs/websockets \
  --external=@nestjs/websockets/socket-module \
  --external=@nestjs/microservices/microservices-module \
  --external=@nestjs/graphql \
  --external=class-transformer/storage
mv api/index.bundle.js api/index.ts
