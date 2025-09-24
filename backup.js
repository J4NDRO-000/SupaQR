const fs = require('fs').promises;
const path = require('path');
const archiver = require('archiver');

/**
 * Script para crear backups automáticos de la aplicación
 * Incluye base de datos y archivos subidos
 */

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupDir = 'backups';
  const backupFile = path.join(backupDir, `backup-${timestamp}.tar.gz`);
  
  console.log('📦 Creando backup...');
  
  try {
    // Crear directorio de backups si no existe
    await fs.mkdir(backupDir, { recursive: true });
    
    // Crear el archivo comprimido
    const output = require('fs').createWriteStream(backupFile);
    const archive = archiver('tar', {
      gzip: true,
      gzipOptions: { level: 9 }
    });
    
    // Configurar eventos del archiver
    output.on('close', () => {
      const sizeInMB = (archive.pointer() / 1024 / 1024).toFixed(2);
      console.log(`✅ Backup creado: ${backupFile}`);
      console.log(`📊 Tamaño: ${sizeInMB} MB`);
    });
    
    archive.on('error', (err) => {
      throw err;
    });
    
    // Conectar archive al output
    archive.pipe(output);
    
    // Agregar base de datos
    if (await fileExists('data.db')) {
      archive.file('data.db', { name: 'data.db' });
      console.log('📊 Agregando base de datos...');
    }
    
    // Agregar archivos subidos
    if (await fileExists('uploads')) {
      archive.directory('uploads/', 'uploads/');
      console.log('📁 Agregando archivos subidos...');
    }
    
    // Agregar configuración
    if (await fileExists('package.json')) {
      archive.file('package.json', { name: 'package.json' });
    }
    
    if (await fileExists('.env')) {
      archive.file('.env', { name: '.env' });
      console.log('⚙️  Agregando configuración...');
    }
    
    // Finalizar el archivo
    await archive.finalize();
    
    // Limpiar backups antiguos (mantener solo los últimos 10)
    await cleanOldBackups(backupDir);
    
  } catch (error) {
    console.error('❌ Error creando backup:', error);
    process.exit(1);
  }
}

async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function cleanOldBackups(backupDir) {
  try {
    const files = await fs.readdir(backupDir);
    const backupFiles = files
      .filter(file => file.startsWith('backup-') && file.endsWith('.tar.gz'))
      .map(file => ({
        name: file,
        path: path.join(backupDir, file),
        time: file.slice(7, 26) // Extraer timestamp del nombre
      }))
      .sort((a, b) => b.time.localeCompare(a.time)); // Ordenar por fecha desc
    
    if (backupFiles.length > 10) {
      const filesToDelete = backupFiles.slice(10);
      
      for (const file of filesToDelete) {
        await fs.unlink(file.path);
        console.log(`🗑️  Backup antiguo eliminado: ${file.name}`);
      }
      
      console.log(`🧹 Se mantuvieron los últimos 10 backups`);
    }
    
  } catch (error) {
    console.error('⚠️  Error limpiando backups antiguos:', error);
  }
}

// Función para restaurar desde backup
async function restoreBackup(backupFile) {
  if (!backupFile) {
    console.error('❌ Especifica el archivo de backup a restaurar');
    console.log('💡 Uso: node scripts/backup.js restore backup-2024-01-01T12-00-00.tar.gz');
    return;
  }
  
  const backupPath = backupFile.startsWith('backups/') ? backupFile : `backups/${backupFile}`;
  
  if (!await fileExists(backupPath)) {
    console.error(`❌ Archivo de backup no encontrado: ${backupPath}`);
    return;
  }
  
  console.log(`📦 Restaurando desde: ${backupPath}`);
  console.log('⚠️  ADVERTENCIA: Esto sobrescribirá los datos actuales');
  
  // En un entorno real, aquí implementarías la lógica de restauración
  // Por ejemplo, usando tar para extraer el archivo
  console.log('💡 Para restaurar manualmente:');
  console.log(`   tar -xzf ${backupPath}`);
  console.log('   Después reinicia la aplicación');
}

// Función para listar backups disponibles
async function listBackups() {
  try {
    const backupDir = 'backups';
    
    if (!await fileExists(backupDir)) {
      console.log('📭 No hay backups disponibles');
      return;
    }
    
    const files = await fs.readdir(backupDir);
    const backupFiles = files
      .filter(file => file.startsWith('backup-') && file.endsWith('.tar.gz'))
      .sort()
      .reverse();
    
    if (backupFiles.length === 0) {
      console.log('📭 No hay backups disponibles');
      return;
    }
    
    console.log('📦 Backups disponibles:');
    console.log('========================');
    
    for (const file of backupFiles) {
      const filePath = path.join(backupDir, file);
      const stats = await fs.stat(filePath);
      const size = (stats.size / 1024 / 1024).toFixed(2);
      const date = new Date(stats.mtime).toLocaleString('es-ES');
      
      console.log(`📁 ${file}`);
      console.log(`   📊 Tamaño: ${size} MB`);
      console.log(`   📅 Fecha: ${date}`);
      console.log('');
    }
    
  } catch (error) {
    console.error('❌ Error listando backups:', error);
  }
}

// CLI Interface
async function main() {
  const command = process.argv[2];
  const argument = process.argv[3];
  
  switch (command) {
    case 'create':
    case undefined:
      await createBackup();
      break;
      
    case 'restore':
      await restoreBackup(argument);
      break;
      
    case 'list':
      await listBackups();
      break;
      
    default:
      console.log('📦 QR File Tracker - Sistema de Backups');
      console.log('========================================');
      console.log('');
      console.log('Comandos disponibles:');
      console.log('  create (default) - Crear nuevo backup');
      console.log('  list            - Listar backups disponibles');
      console.log('  restore <file>  - Restaurar desde backup');
      console.log('');
      console.log('Ejemplos:');
      console.log('  node scripts/backup.js');
      console.log('  node scripts/backup.js create');
      console.log('  node scripts/backup.js list');
      console.log('  node scripts/backup.js restore backup-2024-01-01T12-00-00.tar.gz');
      break;
  }
}

main().catch(console.error);