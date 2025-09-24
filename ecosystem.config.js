// Configuración PM2 para QR File Tracker
module.exports = {
  apps: [{
    name: 'qr-file-tracker',
    script: 'server.js',
    instances: 'max', // Usar todos los cores disponibles
    exec_mode: 'cluster',
    
    // Variables de entorno
    env: {
      NODE_ENV: 'development',
      PORT: 3000,
      BASE_URL: 'http://localhost:3000'
    },
    
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      BASE_URL: 'https://tu-dominio.com' // Cambiar por tu dominio
    },
    
    // Configuración de logs
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Configuración de reinicio automático
    watch: false, // Cambiar a true en desarrollo si quieres auto-reload
    ignore_watch: [
      'uploads',
      'logs',
      'node_modules',
      'data.db'
    ],
    
    // Límites de memoria y CPU
    max_memory_restart: '500M',
    
    // Configuración de reinicio
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Configuración avanzada
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Configuración de clustering
    instance_var: 'INSTANCE_ID',
    
    // Configuración de monitoreo
    monitoring: false, // Cambiar a true si usas PM2 Plus
    
    // Scripts de hook (opcional)
    post_update: ['npm install', 'echo "Aplicación actualizada"'],
    
    // Configuración de auto-restart basado en cron
    cron_restart: '0 2 * * *', // Reiniciar diariamente a las 2 AM
    
    // Configuración adicional para producción
    node_args: '--max-old-space-size=1024'
  }],
  
  // Configuración de despliegue (opcional)
  deploy: {
    production: {
      user: 'node',
      host: 'tu-servidor.com',
      ref: 'origin/main',
      repo: 'git@github.com:tu-usuario/qr-file-tracker.git',
      path: '/var/www/qr-file-tracker',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && npm run init-db && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};