const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const QRCode = require('qrcode');
const UAParser = require('ua-parser-js');
const geoip = require('geoip-lite');
const { v4: uuidv4 } = require('uuid');
const archiver = require('archiver');
const mimeTypes = require('mime-types');
const Database = require('../database');

const router = express.Router();
const db = new Database();

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
  const ip = req.ip;
  const geo = geoip.lookup(ip);

  const accessData = {
    upload_id: uploadId,
    ip_address: ip,
    country: geo ? geo.country : 'N/A',
    city: geo ? geo.city : 'N/A',
    device_type: ua.device.type || 'desktop',
    device_vendor: ua.device.vendor,
    device_model: ua.device.model,
    os_name: ua.os.name,
    os_version: ua.os.version,
    browser_name: ua.browser.name,
    browser_version: ua.browser.version,
    language: req.acceptsLanguages()[0],
    file_accessed: fileName,
    timestamp: new Date().toISOString()
  };

  await db.logAccess(accessData);
}

// Subir archivos
router.post('/upload', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No se subieron archivos' });
    }

    const uploadId = req.uploadId;
    const files = req.files.map(f => ({
      name: f.filename,
      size: f.size,
      path: f.path
    }));
    const totalSize = files.reduce((sum, f) => sum + f.size, 0);

    const uploadData = {
      id: uploadId,
      files: files,
      created_at: new Date().toISOString(),
      total_files: files.length,
      total_size: totalSize
    };

    await db.saveUpload(uploadData);

    const shareUrl = `${req.protocol}://${req.get('host')}/share/${uploadId}`;
    const qrUrl = `${req.protocol}://${req.get('host')}/api/qr/${uploadId}`;

    res.status(201).json({
      message: 'Archivos subidos correctamente',
      uploadId: uploadId,
      shareUrl: shareUrl,
      qrUrl: qrUrl,
      files: files
    });

  } catch (error) {
    console.error('Error en subida:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Generar QR como imagen descargable
router.get('/qr/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const upload = await db.getUpload(uploadId);

    if (!upload) {
      return res.status(404).send('Upload no encontrado');
    }

    const shareUrl = `${req.protocol}://${req.get('host')}/share/${uploadId}`;
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `attachment; filename="qr-${uploadId}.png"`);

    QRCode.toFileStream(res, shareUrl, {
      type: 'png',
      width: 300,
      errorCorrectionLevel: 'H',
      margin: 2,
      color: {
        dark: '#0D1B2A',
        light: '#FFFFFF'
      }
    });

  } catch (error) {
    console.error('Error generando QR:', error);
    res.status(500).send('Error interno del servidor');
  }
});

// Descargar archivo individual
router.get('/download/:uploadId/:filename', async (req, res) => {
  try {
    const { uploadId, filename } = req.params;
    const upload = await db.getUpload(uploadId);

    if (!upload) {
      return res.status(404).send('Upload no encontrado');
    }

    const files = JSON.parse(upload.files);
    const fileInfo = files.find(f => f.name === filename);

    if (!fileInfo) {
      return res.status(404).send('Archivo no encontrado');
    }

    const filePath = path.join(__dirname, '..', fileInfo.path);
    
    // Validar que el path no salga del directorio de uploads
    const uploadsDir = path.join(__dirname, '..', 'uploads');
    if (!path.resolve(filePath).startsWith(uploadsDir)) {
        return res.status(403).send('Acceso prohibido');
    }

    // Registrar acceso
    await logAccess(uploadId, req, filename);

    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Error en descarga:', err);
        if (!res.headersSent) {
          res.status(500).send('Error al descargar el archivo');
        }
      }
    });

  } catch (error) {
    console.error('Error en descarga:', error);
    if (!res.headersSent) {
      res.status(500).send('Error interno del servidor');
    }
  }
});

// Descargar todos los archivos como ZIP
router.get('/download/:uploadId/all', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const upload = await db.getUpload(uploadId);

    if (!upload) {
      return res.status(404).send('Upload no encontrado');
    }

    const files = JSON.parse(upload.files);
    if (files.length === 0) {
      return res.status(404).send('No hay archivos para descargar');
    }

    // Registrar acceso para el zip
    await logAccess(uploadId, req, 'all_files.zip');

    const zipFileName = `upload-${uploadId}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(res);

    for (const file of files) {
      const filePath = path.join(__dirname, '..', file.path);
      // Validar path
      const uploadsDir = path.join(__dirname, '..', 'uploads');
      if (path.resolve(filePath).startsWith(uploadsDir)) {
        archive.file(filePath, { name: file.name });
      }
    }

    await archive.finalize();

  } catch (error) {
    console.error('Error creando ZIP:', error);
    if (!res.headersSent) {
      res.status(500).send('Error al crear el archivo ZIP');
    }
  }
});

// Obtener estadísticas de un upload
router.get('/stats/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const stats = await db.getUploadStats(uploadId);
    res.json(stats);
  } catch (error) {
    console.error('Error obteniendo stats:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Obtener todas las estadísticas para el dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const data = await db.getDashboardData();
    res.json(data);
  } catch (error) {
    console.error('Error obteniendo datos del dashboard:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Exportar datos a CSV
router.get('/export/csv', async (req, res) => {
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

module.exports = router;
