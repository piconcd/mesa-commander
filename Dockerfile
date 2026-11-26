FROM mcr.microsoft.com/playwright:v1.65.1-noble
WORKDIR /usr/src/app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server/ ./server/
COPY app/ ./app/
COPY config/ ./config/
ENV NODE_ENV=production PORT=3000 CHROMIUM_PROFILE=/data/chromium
RUN mkdir -p /data/chromium && chown -R pwuser:pwuser /data /usr/src/app
USER pwuser
EXPOSE 3000
CMD ["node", "server/index.mjs"]
