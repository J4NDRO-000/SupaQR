#!/bin/bash

# Script de instalación automática para QR File Tracker
# Ejecutar con: bash install.sh

echo "🚀 Instalando QR File Tracker..."
echo "=================================="

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para imprimir con colores
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Verificar si Node.js está instalado
if ! command -v node &> /dev/null; then
    print_error "Node.js no está instalado"
    print_status "Instalando Node.js..."
    
    # Detectar sistema operativo
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        if command -v brew &> /dev/null; then
            brew install node
        else
            print_error "Homebrew no está instalado. Instala Node.js manualmente desde https://nodejs.org/"
            exit 1
        fi
    else
        print_error "Sistema operativo no soportado. Instala Node.js manualmente desde https://nodejs.org/"
        exit 1
    fi
fi

# Verificar versión de Node.js
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    print_error "Se requiere Node.js 16 o superior. Versión actual: $(node --version)"
    exit 1
fi

print_success "Node.js $(node --version) está instalado"

# Verificar si npm está disponible
if ! command -v npm &> /dev/null; then
    print_error "npm no está disponible"
    exit 1
fi

print_success "npm $(npm --version) está disponible"

# Instalar dependencias
print_status "Instalando dependencias..."
if npm install; then
    print_success "Dependencias instaladas correctamente"
else
    print_error "Error instalando dependencias"
    exit 1
fi

# Crear directorios necesarios
print_status "Creando directorios..."
mkdir -p uploads
mkdir -p logs
print_success "Directorios creados"

# Inicializar base de datos
print_status "Inicializando base de datos..."
if npm run init-db; then
    print_success "Base de datos inicializada"
else
    print_error "Error inicializando base de datos"
    exit 1
fi

# Crear archivo .env si no existe
if [ ! -f .env ]; then
    print_status "Creando archivo .env..."
    cp .env.example .env
    print_warning "Revisa y ajusta las variables en .env según tu configuración"
fi

# Verificar permisos de escritura
if [ ! -w uploads ]; then
    print_warning "La carpeta uploads/ podría no tener permisos de escritura"
    chmod 755 uploads
fi

# Mostrar información de finalización
echo ""
echo "================================================"
print_success "¡Instalación completada exitosamente!"
echo "================================================"
echo ""
print_status "Para iniciar la aplicación:"
echo "  📦 Desarrollo: npm run dev"
echo "  🚀 Producción: npm start"
echo ""
print_status "URLs de acceso:"
echo "  📤 Subir archivos: http://localhost:3000"
echo "  📊 Dashboard: http://localhost:3000/dashboard.html"
echo ""
print_status "Para producción, considera:"
echo "  🔒 Configurar HTTPS"
echo "  🌐 Configurar dominio en BASE_URL"
echo "  📈 Usar PM2 para gestión de procesos"
echo "  🐳 Usar Docker para despliegue"
echo ""

# Verificar si PM2 está instalado
if command -v pm2 &> /dev/null; then
    print_status "Para usar PM2:"
    echo "  pm2 start server.js --name qr-tracker"
    echo "  pm2 save && pm2 startup"
else
    print_status "Para instalar PM2 (recomendado para producción):"
    echo "  npm install -g pm2"
fi

# Verificar si Docker está disponible
if command -v docker &> /dev/null; then
    print_status "Para usar Docker:"
    echo "  docker-compose up -d"
fi

echo ""
print_success "¡Listo para usar! 🎉"