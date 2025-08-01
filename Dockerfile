FROM node:18-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install --only=production
COPY . .

FROM node:18-alpine

WORKDIR /app
COPY --from=build /app /app

EXPOSE 80
CMD [ "node", "app.js" ]