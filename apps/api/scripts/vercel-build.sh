#!/usr/bin/env bash
set -euo pipefail

# better-auth's Nest adapter detects express via an aliased `require$1("express")`
# call that bundlers can't statically analyze, so express silently drops out of
# the deployed bundle. Rewrite it to a literal require() so Bun inlines it.
for f in $(find ../../node_modules -path "*@thallesp/nestjs-better-auth/dist/index.mjs" 2>/dev/null); do
  sed -i.bak 's/require\$1("express")/require("express")/' "$f" && rm -f "$f.bak"
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
