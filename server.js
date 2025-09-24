const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const QRCode = require('qrcode');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const archiver = require('archiver');
const mimeTypes = require('mime-types');
const Database = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Inicializar base de datos
const db = new Database();

// Middleware de seguridad
app.use(helmet({
  contentSecurityPolicy: false // Para permitir inline scripts en desarrollo
}));
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // límite de 100 requests por ventana de tiempo
});
app.use('/api', limiter);

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadId = req.uploadId || uuidv4();
    const dir = `uploads/${uploadId}`;
    req.uploadId = uploadId;
    
    fs.mkdir(dir, { recursive: true })
      .then(() => cb(null, dir))
      .catch(cb);
  },
  filename: function (req, file, cb) {
    // Mantener el nombre original del archivo
    cb(null, Buffer.from(file.originalname, 'latin1').toString('utf8'));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB por archivo
  }
});

// Función para registrar acceso
async function logAccess(uploadId, req, fileName = null) {
  const ua = UAParser(req.get('User-Agent'));
  const ip = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
  const geo = geoip.lookup(ip);
  
  const accessData = {
    upload_id: uploadId,
    ip_address: ip,
    country: geo ? geo.country : 'Unknown',
    city: geo ? geo.city : 'Unknown',
    device_type: ua.device.type || 'desktop',
    device_vendor: ua.device.vendor || 'Unknown',
    device_model: ua.device.model || 'Unknown',
    os_name: ua.os.name || 'Unknown',
    os_version: ua.os.version || 'Unknown',
    browser_name: ua.browser.name || 'Unknown',
    browser_version: ua.browser.version || 'Unknown',
    language: req.get('Accept-Language') ? req.get('Accept-Language').split(',')[0] : 'Unknown',
    file_accessed: fileName,
    timestamp: new Date().toISOString()
  };
  
  await db.logAccess(accessData);
}

// API Routes

// Subir archivos
app.post('/api/upload', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se subieron archivos' });
    }

    const uploadId = req.uploadId;
    const files = req.files.map(file => ({
      original_name: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      filename: file.filename,
      path: file.path,
      size: file.size,
      mimetype: file.mimetype
    }));

    // Guardar información en la base de datos
    await db.saveUpload({
      id: uploadId,
      files: files,
      created_at: new Date().toISOString(),
      total_files: files.length,
      total_size: files.reduce((sum, file) => sum + file.size, 0)
    });

    // Generar QR code
    const shareUrl = `${BASE_URL}/share/${uploadId}`;
    const qrDataUrl = await QRCode.toDataURL(shareUrl, {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    res.json({
      uploadId,
      shareUrl,
      qrCode: qrDataUrl,
      files: files.map(f => ({ name: f.original_name, size: f.size }))
    });

  } catch (error) {
    console.error('Error en upload:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Generar QR como imagen descargable
app.get('/api/qr/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const upload = await db.getUpload(uploadId);
    
    if (!upload) {
      return res.status(404).json({ error: 'Upload no encontrado' });
    }

    const shareUrl = `${BASE_URL}/share/${uploadId}`;
    const qrBuffer = await QRCode.toBuffer(shareUrl, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="qr-${uploadId}.png"`
    });
    
    res.send(qrBuffer);
  } catch (error) {
    console.error('Error generando QR:', error);
    res.status(500).json({ error: 'Error generando QR' });
  }
});

// Página para mostrar archivos compartidos
app.get('/share/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const upload = await db.getUpload(uploadId);
    
    if (!upload) {
      return res.status(404).send('Archivos no encontrados');
    }

    // Registrar el acceso
    await logAccess(uploadId, req);

    const files = JSON.parse(upload.files);
    
    // Si es un solo archivo, redirigir a descarga directa
    if (files.length === 1) {
      const file = files[0];
      const filePath = path.join(__dirname, 'uploads', uploadId, file.filename);
      
      try {
        await fs.access(filePath);
        await logAccess(uploadId, req, file.original_name);
        
        res.set({
          'Content-Disposition': `attachment; filename="${encodeURIComponent(file.original_name)}"`,
          'Content-Type': file.mimetype || mimeTypes.lookup(file.original_name) || 'application/octet-stream'
        });
        
        return res.sendFile(path.resolve(filePath));
      } catch (error) {
        return res.status(404).send('Archivo no encontrado');
      }
    }

    // Si son múltiples archivos, mostrar lista
    let html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Archivos Compartidos</title>
        <style>
            body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
            .file-list { list-style: none; padding: 0; }
            .file-item { background: #f5f5f5; margin: 10px 0; padding: 15px; border-radius: 5px; display: flex; justify-content: space-between; align-items: center; }
            .download-btn { background: #007bff; color: white; text-decoration: none; padding: 8px 15px; border-radius: 4px; }
            .download-all { background: #28a745; color: white; text-decoration: none; padding: 10px 20px; border-radius: 4px; margin-bottom: 20px; display: inline-block; }
            .file-info { flex-grow: 1; }
            .file-size { color: #666; font-size: 0.9em; }
        </style>
    </head>
    <body>
        <h1>Archivos Compartidos</h1>
        <p>${files.length} archivo(s) disponible(s)</p>
        
        <a href="/api/download/${uploadId}/all" class="download-all">📦 Descargar Todo (ZIP)</a>
        
        <ul class="file-list">`;
    
    files.forEach(file => {
      const fileSize = (file.size / 1024 / 1024).toFixed(2);
      html += `
        <li class="file-item">
            <div class="file-info">
                <strong>${file.original_name}</strong>
                <div class="file-size">${fileSize} MB</div>
            </div>
            <a href="/api/download/${uploadId}/${encodeURIComponent(file.original_name)}" class="download-btn">⬇️ Descargar</a>
        </li>`;
    });
    
    html += `
        </ul>
    </body>
    </html>`;
    
    res.send(html);

  } catch (error) {
    console.error('Error mostrando archivos:', error);
    res.status(500).send('Error interno del servidor');
  }
});

// Descargar archivo individual
app.get('/api/download/:uploadId/:filename', async (req, res) => {
  try {
    const { uploadId, filename } = req.params;
    const decodedFilename = decodeURIComponent(filename);
    
    const upload = await db.getUpload(uploadId);
    if (!upload) {
      return res.status(404).json({ error: 'Upload no encontrado' });
    }

    const files = JSON.parse(upload.files);
    const file = files.find(f => f.original_name === decodedFilename);
    
    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }

    const filePath = path.join(__dirname, 'uploads', uploadId, file.filename);
    
    try {
      await fs.access(filePath);
      await logAccess(uploadId, req, decodedFilename);
      
      res.set({
        'Content-Disposition': `attachment; filename="${encodeURIComponent(decodedFilename)}"`,
        'Content-Type': file.mimetype || mimeTypes.lookup(decodedFilename) || 'application/octet-stream'
      });
      
      res.sendFile(path.resolve(filePath));
    } catch (error) {
      res.status(404).json({ error: 'Archivo no encontrado en el sistema' });
    }

  } catch (error) {
    console.error('Error descargando archivo:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Descargar todos los archivos como ZIP
app.get('/api/download/:uploadId/all', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const upload = await db.getUpload(uploadId);
    
    if (!upload) {
      return res.status(404).json({ error: 'Upload no encontrado' });
    }

    await logAccess(uploadId, req, 'ZIP_DOWNLOAD');

    const files = JSON.parse(upload.files);
    
    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="archivos-${uploadId}.zip"`
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.on('error', (err) => {
      console.error('Error creando ZIP:', err);
      res.status(500).json({ error: 'Error creando ZIP' });
    });

    archive.pipe(res);

    // Agregar archivos al ZIP
    for (const file of files) {
      const filePath = path.join(__dirname, 'uploads', uploadId, file.filename);
      try {
        await fs.access(filePath);
        archive.file(filePath, { name: file.original_name });
      } catch (error) {
        console.error(`Archivo no encontrado: ${filePath}`);
      }
    }

    archive.finalize();

  } catch (error) {
    console.error('Error creando ZIP:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener estadísticas de un upload
app.get('/api/stats/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const stats = await db.getUploadStats(uploadId);
    res.json(stats);
  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener todas las estadísticas para el dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    const data = await db.getDashboardData();
    res.json(data);
  } catch (error) {
    console.error('Error obteniendo datos del dashboard:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Exportar datos a CSV
app.get('/api/export/csv', async (req, res) => {
  try {
    const logs = await db.getAccessLogsForExport();
    
    if (logs.length === 0) {
      return res.status(404).send('No hay datos para exportar');
    }

    const csvHeader = Object.keys(logs[0]).join(',') + '\n';
    const csvRows = logs.map(row => Object.values(row).join(',')).join('\n');
    const csvData = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="access_logs.csv"');
    res.send(csvData);

  } catch (error) {
    console.error('Error exportando CSV:', error);
    res.status(500).send('Error interno del servidor');
  }
});

// Middleware para manejar errores 404
app.use('*', (req, res) => {
  res.status(404).send('Ruta no encontrada');
});

// Servir archivos estáticos al final
app.use('/', express.static(path.join(__dirname, 'public')));

// Inicializar servidor
async function startServer() {
  try {
    await db.init();
    
    // Crear directorio de uploads si no existe
    await fs.mkdir('uploads', { recursive: true });
    
    app.listen(PORT, () => {
      console.log(`🚀 Servidor corriendo en ${BASE_URL}`);
      console.log(`📊 Dashboard disponible en ${BASE_URL}/dashboard.html`);
      console.log(`📤 Upload disponible en ${BASE_URL}/index.html`);
    });
  } catch (error) {
    console.error('Error iniciando servidor:', error);
    process.exit(1);
  }
}

startServer();