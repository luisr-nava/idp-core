FROM node:20-alpine
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci \
    && npm cache clean --force \
    && rm -rf /root/.npm

COPY . .
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/main.js"]
