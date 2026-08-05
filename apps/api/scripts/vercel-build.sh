#!/usr/bin/env bash
set -euo pipefail
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
