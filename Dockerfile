# Usar Node.js 18 Alpine para tamaño optimizado
FROM node:18-alpine

# Crear directorio de la aplicación
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de producción
RUN npm ci --only=production && npm cache clean --force

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S qrtracker -u 1001

# Copiar código fuente
COPY . .

# Crear directorios necesarios con permisos correctos
RUN mkdir -p uploads && \
    chown -R qrtracker:nodejs /app

# Cambiar a usuario no-root
USER qrtracker

# Exponer puerto
EXPOSE 3000

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=3000

# Comando de inicio
CMD ["node", "server.js"]