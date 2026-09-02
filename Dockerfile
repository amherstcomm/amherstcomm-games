# check=skip=SecretsUsedInArgOrEnv
#
# That directive has to be the first line to take effect — a comment above it
# and BuildKit stops reading. It silences a warning on VITE_SUPABASE_ANON_KEY,
# which is not a secret: the anon key is public by design and ships inside the
# JavaScript either way, because row-level security is what protects the data.
# Skipped rather than left standing, since two permanent warnings teach people
# to ignore warnings.

# Two stages: build the SPA with Node, serve the static output with nginx.
#
# Everything Vite needs is fixed at *build* time, not run time. The Supabase
# URL and anon key are read through `import.meta.env` and compiled into the
# bundle; VITE_SITE_ORIGIN is read by vite.config.ts and stamped into
# index.html, sitemap.xml and robots.txt. So an image is specific to one
# environment: changing any of these means rebuilding, not restarting.
#
# That is the one ergonomic loss against Render, which rebuilt on an env var
# change by itself. `docker compose up -d --build` covers both in one command,
# so editing .env and forgetting to rebuild is not a reachable state.

# Node 22 to match .github/workflows/ci.yml — package.json allows >=20, but the
# suite is only ever run on 22, so the image builds on what is actually tested.
FROM node:22-alpine AS build

WORKDIR /app

# Dependencies first: this layer is cached until the lockfile itself moves,
# so an ordinary source change rebuilds in seconds rather than re-resolving
# the whole tree.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Build args rather than ENV: these must exist during `npm run build`, and
# leaving them out of the runtime stage keeps them from looking like things
# the running container reads. Empty VITE_SUPABASE_* is a supported state —
# src/supabase.ts builds no client and every auth surface hides, so the image
# still runs as a fully local site.
#
# VITE_SITE_ORIGIN is the one with an unsafe fallback. vite.config.ts defaults
# it to https://anagrimoire.com, and treats that exact string as "production" —
# so an unset (or empty, which is falsy) value emits `robots.txt: Allow: /`
# advertising upstream's sitemap, and stamps upstream's domain into every
# link-preview tag. The localhost default below is deliberately not that
# string, so a forgotten value fails closed to `Disallow: /` instead.
ARG VITE_SUPABASE_URL=""
ARG VITE_SUPABASE_ANON_KEY=""
ARG VITE_SITE_ORIGIN="http://localhost:8080"
ARG VITE_GA_ID=""
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_SITE_ORIGIN=$VITE_SITE_ORIGIN \
    VITE_GA_ID=$VITE_GA_ID

RUN npm run build

FROM nginx:1.27-alpine AS serve

# Replaces the default server block, which has no SPA rewrite and would 404
# every route below the root.
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx:alpine ships no curl or wget-with-spider; the busybox wget is enough
# to prove the server answers.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
