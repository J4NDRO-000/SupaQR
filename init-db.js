const Database = require('../database');

async function initializeDatabase() {
  console.log('🔧 Inicializando base de datos...');
  
  try {
    const db = new Database();
    await db.init();
    console.log('✅ Base de datos inicializada correctamente');
    console.log('📊 Tablas creadas: uploads, access_logs');
    
    // Cerrar conexión
    db.close();
    
    console.log('🚀 ¡Listo! Ahora puedes ejecutar: npm start');
    
  } catch (error) {
    console.error('❌ Error inicializando base de datos:', error);
    process.exit(1);
  }
}

initializeDatabase();