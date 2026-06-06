FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p output

EXPOSE 3000
CMD ["node", "server.js"]
