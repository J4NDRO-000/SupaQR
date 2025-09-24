const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const dbPath = path.join(__dirname, 'data.db');
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Error conectando a la base de datos:', err);
          reject(err);
        } else {
          console.log('✅ Conectado a la base de datos SQLite');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    const createUploadsTable = `
      CREATE TABLE IF NOT EXISTS uploads (
        id TEXT PRIMARY KEY,
        files TEXT NOT NULL,
        created_at TEXT NOT NULL,
        total_files INTEGER NOT NULL,
        total_size INTEGER NOT NULL
      )
    `;

    const createAccessLogsTable = `
      CREATE TABLE IF NOT EXISTS access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upload_id TEXT NOT NULL,
        ip_address TEXT,
        country TEXT,
        city TEXT,
        device_type TEXT,
        device_vendor TEXT,
        device_model TEXT,
        os_name TEXT,
        os_version TEXT,
        browser_name TEXT,
        browser_version TEXT,
        language TEXT,
        file_accessed TEXT,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (upload_id) REFERENCES uploads (id)
      )
    `;

    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(createUploadsTable, (err) => {
          if (err) {
            console.error('Error creando tabla uploads:', err);
            reject(err);
            return;
          }
        });

        this.db.run(createAccessLogsTable, (err) => {
          if (err) {
            console.error('Error creando tabla access_logs:', err);
            reject(err);
            return;
          }
          resolve();
        });
      });
    });
  }

  async saveUpload(uploadData) {
    const { id, files, created_at, total_files, total_size } = uploadData;
    
    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO uploads (id, files, created_at, total_files, total_size)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run([id, JSON.stringify(files), created_at, total_files, total_size], function(err) {
        if (err) {
          console.error('Error guardando upload:', err);
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });
      
      stmt.finalize();
    });
  }

  async getUpload(uploadId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM uploads WHERE id = ?',
        [uploadId],
        (err, row) => {
          if (err) {
            console.error('Error obteniendo upload:', err);
            reject(err);
          } else {
            resolve(row);
          }
        }
      );
    });
  }

  async logAccess(accessData) {
    const {
      upload_id, ip_address, country, city, device_type, device_vendor,
      device_model, os_name, os_version, browser_name, browser_version,
      language, file_accessed, timestamp
    } = accessData;

    return new Promise((resolve, reject) => {
      const stmt = this.db.prepare(`
        INSERT INTO access_logs (
          upload_id, ip_address, country, city, device_type, device_vendor,
          device_model, os_name, os_version, browser_name, browser_version,
          language, file_accessed, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        upload_id, ip_address, country, city, device_type, device_vendor,
        device_model, os_name, os_version, browser_name, browser_version,
        language, file_accessed, timestamp
      ], function(err) {
        if (err) {
          console.error('Error guardando acceso:', err);
          reject(err);
        } else {
          resolve({ id: this.lastID });
        }
      });

      stmt.finalize();
    });
  }

  async getUploadStats(uploadId) {
    return new Promise((resolve, reject) => {
      // Obtener información básica del upload
      this.db.get(
        'SELECT * FROM uploads WHERE id = ?',
        [uploadId],
        (err, upload) => {
          if (err) {
            reject(err);
            return;
          }

          if (!upload) {
            resolve(null);
            return;
          }

          // Obtener estadísticas de accesos
          this.db.all(`
            SELECT 
              COUNT(*) as total_accesses,
              COUNT(DISTINCT ip_address) as unique_visitors,
              COUNT(DISTINCT country) as countries_count,
              COUNT(DISTINCT device_type) as device_types_count
            FROM access_logs WHERE upload_id = ?
          `, [uploadId], (err, stats) => {
            if (err) {
              reject(err);
              return;
            }

            // Obtener accesos por día
            this.db.all(`
              SELECT 
                DATE(timestamp) as date,
                COUNT(*) as accesses
              FROM access_logs 
              WHERE upload_id = ?
              GROUP BY DATE(timestamp)
              ORDER BY date DESC
              LIMIT 30
            `, [uploadId], (err, dailyStats) => {
              if (err) {
                reject(err);
                return;
              }

              // Obtener distribución por país
              this.db.all(`
                SELECT 
                  country,
                  COUNT(*) as count
                FROM access_logs 
                WHERE upload_id = ?
                GROUP BY country
                ORDER BY count DESC
                LIMIT 10
              `, [uploadId], (err, countryStats) => {
                if (err) {
                  reject(err);
                  return;
                }

                // Obtener últimos accesos
                this.db.all(`
                  SELECT *
                  FROM access_logs 
                  WHERE upload_id = ?
                  ORDER BY timestamp DESC
                  LIMIT 50
                `, [uploadId], (err, recentAccesses) => {
                  if (err) {
                    reject(err);
                    return;
                  }

                  resolve({
                    upload: upload,
                    stats: stats[0],
                    dailyStats,
                    countryStats,
                    recentAccesses
                  });
                });
              });
            });
          });
        }
      );
    });
  }

  async getDashboardData() {
    return new Promise((resolve, reject) => {
      // Obtener todos los uploads con sus estadísticas
      this.db.all(`
        SELECT 
          u.*,
          COUNT(a.id) as total_accesses,
          COUNT(DISTINCT a.ip_address) as unique_visitors,
          MAX(a.timestamp) as last_access
        FROM uploads u
        LEFT JOIN access_logs a ON u.id = a.upload_id
        GROUP BY u.id
        ORDER BY u.created_at DESC
      `, [], (err, uploads) => {
        if (err) {
          reject(err);
          return;
        }

        // Obtener estadísticas generales
        this.db.get(`
          SELECT 
            COUNT(DISTINCT u.id) as total_uploads,
            COUNT(a.id) as total_accesses,
            COUNT(DISTINCT a.ip_address) as unique_visitors,
            SUM(u.total_size) as total_storage
          FROM uploads u
          LEFT JOIN access_logs a ON u.id = a.upload_id
        `, [], (err, generalStats) => {
          if (err) {
            reject(err);
            return;
          }

          // Obtener accesos por día (últimos 30 días)
          this.db.all(`
            SELECT 
              DATE(timestamp) as date,
              COUNT(*) as accesses,
              COUNT(DISTINCT ip_address) as unique_visitors
            FROM access_logs 
            WHERE timestamp >= datetime('now', '-30 days')
            GROUP BY DATE(timestamp)
            ORDER BY date DESC
          `, [], (err, dailyStats) => {
            if (err) {
              reject(err);
              return;
            }

            // Obtener distribución por países
            this.db.all(`
              SELECT 
                country,
                COUNT(*) as count
              FROM access_logs 
              GROUP BY country
              ORDER BY count DESC
              LIMIT 10
            `, [], (err, countryStats) => {
              if (err) {
                reject(err);
                return;
              }

              // Obtener distribución por dispositivos
              this.db.all(`
                SELECT 
                  device_type,
                  COUNT(*) as count
                FROM access_logs 
                GROUP BY device_type
                ORDER BY count DESC
              `, [], (err, deviceStats) => {
                if (err) {
                  reject(err);
                  return;
                }

                resolve({
                  uploads: uploads.map(upload => ({
                    ...upload,
                    files: JSON.parse(upload.files)
                  })),
                  generalStats: generalStats,
                  dailyStats,
                  countryStats,
                  deviceStats
                });
              });
            });
          });
        });
      });
    });
  }

  async getAccessLogsForExport() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT * FROM access_logs
        ORDER BY timestamp DESC
      `, [], (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  close() {
    if (this.db) {
      this.db.close((err) => {
        if (err) {
          console.error('Error cerrando base de datos:', err);
        } else {
          console.log('Base de datos cerrada');
        }
      });
    }
  }
}

module.exports = Database;