# Dockerfile لنشر المشروع على Fly.io (Node server)
# يستخدم Bun في البناء وNode 22 في التشغيل
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
# نتجنب تشغيل postinstall أثناء التثبيت لأنه يحتاج ملفات المصدر التي لم تُنسخ بعد
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .

# احذف أي مخرجات قديمة قبل البناء حتى يستحيل دخول حزمة سابقة في الصورة الجديدة.
RUN node scripts/clean-build.mjs

# متغيرات البناء المطلوبة للـ client bundle (تُمرر عبر --build-arg)
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    NITRO_PRESET=node-server \
    NITRO_OUTPUT_DIR=.output

RUN bun run build:node

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    NITRO_PORT=3000 \
    NITRO_HOST=0.0.0.0

COPY --from=build /app/.output ./.output
COPY --from=build /app/scripts/fly-start.mjs ./scripts/fly-start.mjs

EXPOSE 3000
CMD ["node", "scripts/fly-start.mjs"]
