# Stage 1 – build React app
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --silent

COPY . .
# VITE_API_URL vacío → el JS usa rutas relativas y nginx hace el proxy al backend
RUN VITE_API_URL="" npm run build

# Stage 2 – serve with nginx
FROM nginx:1.27-alpine

# envsubst viene incluido en nginx:alpine via gettext
RUN apk add --no-cache gettext

COPY --from=builder /app/dist /usr/share/nginx/html

# nginx.conf usa ${BACKEND_URL} — se sustituye en el entrypoint
COPY nginx.conf /etc/nginx/conf.d/default.conf.template

# BACKEND_URL default apunta al servicio docker-compose local;
# para GCP pásala como variable al correr el contenedor:
#   docker run -e BACKEND_URL=https://api.gammaingenieros.com ...
ENV BACKEND_URL=http://backend:8000

EXPOSE 80

# Sustituye variables en la plantilla nginx y arranca
CMD ["/bin/sh", "-c", \
     "envsubst '${BACKEND_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
