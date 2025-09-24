# 🚀 QR File Tracker

Una aplicación web completa para subir archivos, generar códigos QR únicos y hacer seguimiento detallado de todos los accesos con analytics tipo CRM.

## ✨ Características

- 📤 **Subida de archivos**: Soporta cualquier tipo de archivo (hasta 50MB cada uno)
- 🗂️ **Carpetas completas**: Sube múltiples archivos de una vez con drag & drop
- 📱 **Códigos QR únicos**: Genera QR descargables que nunca caducan
- 📊 **Analytics completos**: Tracking detallado con IP, ubicación, dispositivo, navegador
- 🎯 **Dashboard CRM**: Panel administrativo con gráficas y estadísticas
- 💾 **Exportación**: Descarga datos en CSV para análisis externos
- 🔒 **Auto-hosted**: Sin dependencias externas, control total de tus datos

## 🛠️ Tecnologías Utilizadas

### Backend
- **Node.js** + Express.js
- **SQLite** (base de datos local)
- **Multer** (subida de archivos)
- **QRCode** (generación de códigos QR)
- **UA-Parser-js** (detección de dispositivos)
- **GeoIP-lite** (geolocalización por IP)

### Frontend
- **HTML5 + CSS3** con diseño responsive
- **JavaScript vanilla** (sin frameworks pesados)
- **Chart.js** (gráficas interactivas)
- **Drag & Drop API** nativo

### Seguridad
- **Helmet.js** (headers de seguridad)
- **Rate limiting** (protección contra spam)
- **CORS** configurado
- **Validación** de archivos y tamaños

## 📋 Instalación y Configuración

### Prerequisitos

- Node.js 16+ 
- npm o yarn

### 1. Clonar e instalar dependencias

```bash
# Clonar el proyecto
git clone <tu-repo>
cd qr-file-tracker

# Instalar dependencias
npm install
```

### 2. Configurar variables de entorno (opcional)

Crea un archivo `.env`:

```bash
PORT=3000
BASE_URL=http://localhost:3000
```

### 3. Inicializar la base de datos

```bash
npm run init-db
```

### 4. Ejecutar la aplicación

```bash
# Desarrollo (con nodemon)
npm run dev

# Producción
npm start
```

### 5. Acceder a la aplicación

- **Subida de archivos**: http://localhost:3000
- **Dashboard**: http://localhost:3000/dashboard.html

## 📁 Estructura del Proyecto

```
qr-file-tracker/
├── server.js              # Servidor principal
├── database.js            # Manejo de base de datos
├── package.json            # Dependencias
├── data.db                 # Base de datos SQLite (se crea automáticamente)
├── uploads/               # Carpeta de archivos subidos
├── public/                # Frontend
│   ├── index.html         # Página de subida
│   └── dashboard.html     # Panel administrativo
└── scripts/
    └── init-db.js         # Script de inicialización
```

## 🔄 Flujo de la Aplicación

### 1. Subida de Archivos
1. Usuario arrastra archivos o los selecciona
2. Se crea un ID único para el upload
3. Archivos se guardan en `/uploads/{uploadId}/`
4. Se genera código QR con enlace único
5. Usuario puede descargar el QR como PNG

### 2. Acceso via QR
1. Alguien escanea el QR o accede al enlace
2. Se registra automáticamente:
   - IP y geolocalización
   - Dispositivo y navegador
   - Fecha y hora exacta
   - Archivo específico accedido
3. Si hay un solo archivo → descarga directa
4. Si hay múltiples → lista con opciones de descarga

### 3. Analytics y Seguimiento
1. Dashboard muestra estadísticas en tiempo real
2. Gráficas de accesos por día
3. Distribución geográfica y por dispositivos
4. Historial detallado por upload
5. Exportación a CSV para análisis externo

## 📊 Datos que se Rastrean

Para cada acceso se registra:
- 🌍 **Ubicación**: País y ciudad (vía GeoIP)
- 📱 **Dispositivo**: Tipo (móvil/tablet/desktop), marca, modelo
- 💻 **Sistema**: SO y versión
- 🌐 **Navegador**: Nombre y versión
- 🗣️ **Idioma**: Idioma preferido del navegador
- 📂 **Archivo**: Archivo específico accedido/descargado
- ⏰ **Timestamp**: Fecha y hora exacta
- 🔗 **IP**: Dirección IP del visitante

## 🚀 Despliegue en Producción

### Opción 1: VPS/Servidor Propio

```bash
# En tu servidor
git clone <tu-repo>
cd qr-file-tracker
npm install --production
npm start
```

### Opción 2: Docker

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t qr-file-tracker .
docker run -p 3000:3000 -v $(pwd)/uploads:/app/uploads -v $(pwd)/data.db:/app/data.db qr-file-tracker
```

### Opción 3: PM2 (Recomendado)

```bash
npm install -g pm2
pm2 start server.js --name "qr-tracker"
pm2 save
pm2 startup
```

## 🔧 Configuración Avanzada

### Cambiar límites de archivos

En `server.js`, modifica:

```javascript
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  }
});
```

### Usar PostgreSQL en lugar de SQLite

1. Instalar: `npm install pg`
2. Modificar `database.js` para usar PostgreSQL
3. Configurar variables de entorno de conexión

### Habilitar HTTPS

```javascript
const https = require('https');
const fs = require('fs');

const options = {
  key: fs.readFileSync('path/to/private-key.pem'),
  cert: fs.readFileSync('path/to/certificate.pem')
};

https.createServer(options, app).listen(443);
```

## 📈 Monitoreo y Mantenimiento

### Logs de la Aplicación
Los logs se muestran en consola. Para producción, configura un logger como Winston.

### Backup de Datos
```bash
# Backup de base de datos
cp data.db data.db.backup.$(date +%Y%m%d)

# Backup de archivos
tar -czf uploads.backup.$(date +%Y%m%d).tar.gz uploads/
```

### Limpieza de Archivos Antiguos
Puedes crear un cron job para eliminar uploads antiguos:

```bash
# Eliminar uploads de más de 90 días
find uploads/ -type d -mtime +90 -exec rm -rf {} \;
```

## 🤝 API Endpoints

### Públicos
- `POST /api/upload` - Subir archivos
- `GET /share/:uploadId` - Ver archivos compartidos  
- `GET /api/download/:uploadId/:filename` - Descargar archivo específico
- `GET /api/download/:uploadId/all` - Descargar como ZIP

### Administrativos  
- `GET /api/dashboard` - Datos del dashboard
- `GET /api/stats/:uploadId` - Estadísticas de un upload
- `GET /api/qr/:uploadId` - Descargar QR como imagen
- `GET /api/export/csv` - Exportar logs a CSV

## 🐛 Solución de Problemas

### Error: ENOSPC (Sin espacio)
```bash
# Verificar espacio en disco
df -h
# Limpiar archivos temporales si es necesario
```

### Error: Puerto en uso
```bash
# Verificar qué proceso usa el puerto
lsof -i :3000
# Cambiar puerto en .env o matar proceso
```

### Base de datos corrupta
```bash
# Recrear base de datos
rm data.db
npm run init-db
```

## 📝 TODO / Mejoras Futuras

- [ ] Autenticación y múltiples usuarios
- [ ] Caducidad configurable para QR
- [ ] Interfaz para eliminar uploads
- [ ] Integración con servicios de email
- [ ] API webhooks para notificaciones
- [ ] Soporte para enlaces personalizados
- [ ] Estadísticas más avanzadas con Machine Learning

## 📄 Licencia

MIT License - puedes usar este código libremente para proyectos personales y comerciales.

## 🆘 Soporte

Si encuentras algún problema:

1. Revisa los logs de la aplicación
2. Verifica que todas las dependencias están instaladas
3. Asegúrate de que el puerto no esté en uso
4. Revisa los permisos de las carpetas `uploads/`

---

¡Disfruta usando QR File Tracker! 🚀