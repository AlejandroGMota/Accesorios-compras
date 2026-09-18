# Se construye desde la raíz del repo (necesita analytics/hidrogel-core.js):
#   docker build -f hidrogel-mcp/Dockerfile .
FROM node:22-alpine

WORKDIR /app
# El código es ESM (import/export)
RUN echo '{ "type": "module" }' > package.json

COPY analytics/hidrogel-core.js analytics/
COPY hidrogel-mcp/server.js     hidrogel-mcp/
COPY hidrogel-mcp/src           hidrogel-mcp/src

USER node
ENV PORT=8080
EXPOSE 8080

# 127.0.0.1 y no localhost: en alpine localhost puede resolver a ::1
HEALTHCHECK --interval=30s --timeout=3s \
    CMD node -e "fetch('http://127.0.0.1:8080/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "hidrogel-mcp/server.js"]
