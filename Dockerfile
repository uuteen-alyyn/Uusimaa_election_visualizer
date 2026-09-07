# vaalikartta — container image for the home server.
#
# This image is built from the ALREADY-PUBLISHED `dist` branch, not from source.
#
# Why: `build.yml` produces dist/ by running the PxWeb prefetch, which is
# rate-limited to the point that a cold run can take hours, and which refuses to
# publish a degraded build. That work must not be repeated just to package the
# result. `publish-image.yml` checks the `dist` branch out into ./dist and builds
# this file against it, so packaging is seconds and the expensive build stays
# exactly where it is.
#
# Uses the official UNPRIVILEGED nginx image rather than patching the standard
# one: it already runs as a non-root user, listens on 8080, and writes its pid
# and temp files to paths that user can write.

FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY --chown=nginx:nginx dist/ /usr/share/nginx/html/
COPY --chown=nginx:nginx nginx/site.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

# Probe 127.0.0.1, never `localhost`. nginx listens on 0.0.0.0:8080 — IPv4 only
# — while musl resolves `localhost` to ::1 first, so every busybox wget probe
# gets connection-refused and the container reports (unhealthy) while serving
# traffic perfectly well.
#
# Probe /healthz, never `/`, so the check does not depend on the front page.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
