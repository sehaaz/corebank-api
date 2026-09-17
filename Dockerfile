FROM node:20-alpine

WORKDIR /app

# bcrypt native derleme için
RUN apk add --no-cache --virtual .build-deps python3 make g++

COPY package*.json ./
RUN npm install --omit=dev && apk del .build-deps

COPY src ./src

EXPOSE 3000
CMD ["node", "src/server.js"]
