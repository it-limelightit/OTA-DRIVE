FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY dashboard/package.json dashboard/package.json
RUN npm ci
COPY backend backend
COPY database database
RUN npm run build --workspace=backend

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY dashboard/package.json dashboard/package.json
RUN npm ci --omit=dev --workspace=backend
COPY --from=build /app/backend/dist backend/dist
COPY database database
EXPOSE 3000
CMD ["node", "backend/dist/server.js"]
