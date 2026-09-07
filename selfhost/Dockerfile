# نشر التطبيق على سيرفرك الخاص (Node server) بدون أي اعتماد على استضافة Lovable
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .
# نستبدل .env الجذري (الذي قد يحتوي على قيم Lovable القديمة) بملف selfhost/.env
COPY selfhost/.env ./.env

# متغيرات VITE_* لازم تكون موجودة وقت البناء (تُحقن داخل الـclient bundle)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    NITRO_PRESET=node-server \
    NITRO_OUTPUT_DIR=.output

# البناء بهدف Node server (خارج بيئة Lovable sandbox سيعمل node-server فعليًا)
RUN bun run build:node && \
    test -f .output/server/index.mjs || (echo "لم يُنتج البناء .output/server/index.mjs" && exit 1)

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

COPY --from=build /app/.output ./.output

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
