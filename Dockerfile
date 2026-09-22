FROM node:20-alpine

WORKDIR /app

# Toolchain for building bcrypt's native addon; removed in the same layer.
RUN apk add --no-cache --virtual .build-deps python3 make g++

COPY package*.json ./
RUN npm install --omit=dev && apk del .build-deps

COPY src ./src
COPY docs ./docs

EXPOSE 3000
CMD ["node", "src/server.js"]
