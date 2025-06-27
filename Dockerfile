# 使用 Node.js LTS Alpine 作为基础镜像
FROM node:lts-alpine AS base

# 安装依赖阶段
FROM base AS deps

WORKDIR /app

# 安装 pnpm
RUN npm install -g pnpm

# 复制依赖文件（充分利用 Docker 层缓存）
COPY package.json pnpm-lock.yaml* ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 构建阶段
FROM base AS builder
WORKDIR /app

# 从 deps 阶段复制 node_modules
COPY --from=deps /app/node_modules ./node_modules

# 复制源代码
COPY . .

# 安装 pnpm
RUN npm install -g pnpm

# 设置环境变量
ENV NEXT_TELEMETRY_DISABLED=1

# 构建应用
RUN pnpm build

# 生产运行阶段
FROM base AS runner
WORKDIR /app

# 设置环境变量
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 创建非 root 用户
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# 复制 public 文件夹
COPY --from=builder /app/public ./public

# 设置正确的权限
RUN mkdir .next
RUN chown nextjs:nodejs .next

# 复制构建产物
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# 切换到非 root 用户
USER nextjs

# 暴露端口
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 启动应用
CMD ["node", "server.js"] 