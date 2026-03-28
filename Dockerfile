FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json .
# Copy Nunjucks templates and static assets (not compiled by tsc)
COPY --from=build /app/src/admin/views ./dist/admin/views
COPY --from=build /app/src/admin/public ./dist/admin/public
COPY --from=build /app/src/public/themes ./dist/public/themes
COPY --from=build /app/src/db/migrations ./dist/db/migrations
RUN mkdir -p /app/uploads-data
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
