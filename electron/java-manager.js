const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const { Extract } = require('unzipper');

/**
 * Java Manager - Gestiona la descarga e instalación automática de Java
 * para que los usuarios NO tengan que instalar Java manualmente
 */
class JavaManager {
    constructor(launcherRoot) {
        this.launcherRoot = launcherRoot;
        this.javaDir = path.join(launcherRoot, 'runtime', 'java');
        this.javaExecutable = null;
    }

    /**
     * Obtiene la ruta del ejecutable de Java
     * Primero intenta usar Java del sistema, luego descarga uno si es necesario
     */
    async getJavaPath(minecraftVersion) {
        // 1. Intentar usar Java del sistema (si existe)
        const systemJava = this.findSystemJava();
        if (systemJava) {
            console.log('[JavaManager] Usando Java del sistema:', systemJava);
            return systemJava;
        }

        // 2. Buscar Java descargado previamente
        const localJava = this.findLocalJava();
        if (localJava) {
            console.log('[JavaManager] Usando Java local:', localJava);
            return localJava;
        }

        // 3. Descargar Java automáticamente
        console.log('[JavaManager] No se encontró Java, descargando...');
        return await this.downloadJava(minecraftVersion);
    }

    /**
     * Busca Java en el sistema
     */
    findSystemJava() {
        try {
            if (process.platform === 'win32') {
                const javaPath = execSync('where java', { encoding: 'utf-8' })
                    .split('\r\n')[0]
                    .trim();

                if (javaPath && fs.existsSync(javaPath)) {
                    // Verificar versión
                    const version = this.getJavaVersion(javaPath);
                    if (version >= 17) {
                        return javaPath;
                    }
                    console.log(`[JavaManager] Java del sistema es muy antiguo (v${version}), se necesita v17+`);
                }
            } else {
                const javaPath = execSync('which java', { encoding: 'utf-8' }).trim();
                if (javaPath && fs.existsSync(javaPath)) {
                    const version = this.getJavaVersion(javaPath);
                    if (version >= 17) {
                        return javaPath;
                    }
                }
            }
        } catch (e) {
            console.log('[JavaManager] No se encontró Java en el sistema');
        }
        return null;
    }

    /**
     * Busca Java descargado localmente
     */
    findLocalJava() {
        if (!fs.existsSync(this.javaDir)) {
            return null;
        }

        const javaExe = process.platform === 'win32' ? 'java.exe' : 'java';

        // Buscar en subdirectorios
        try {
            const dirs = fs.readdirSync(this.javaDir);
            for (const dir of dirs) {
                const binPath = path.join(this.javaDir, dir, 'bin', javaExe);
                if (fs.existsSync(binPath)) {
                    return binPath;
                }
            }
        } catch (e) {
            console.error('[JavaManager] Error buscando Java local:', e);
        }

        return null;
    }

    /**
     * Obtiene la versión de Java
     */
    getJavaVersion(javaPath) {
        try {
            const output = execSync(`"${javaPath}" -version 2>&1`, { encoding: 'utf-8' });
            const match = output.match(/version "(\d+)/);
            if (match) {
                return parseInt(match[1]);
            }
        } catch (e) {
            console.error('[JavaManager] Error obteniendo versión de Java:', e);
        }
        return 0;
    }

    /**
     * Descarga Java automáticamente desde Adoptium (Eclipse Temurin)
     */
    async downloadJava(minecraftVersion) {
        // Determinar qué versión de Java necesitamos
        const javaVersion = this.getRequiredJavaVersion(minecraftVersion);

        console.log(`[JavaManager] Descargando Java ${javaVersion}...`);

        // Crear directorio si no existe
        if (!fs.existsSync(this.javaDir)) {
            fs.mkdirSync(this.javaDir, { recursive: true });
        }

        // URL de descarga (Adoptium/Eclipse Temurin)
        const downloadUrl = this.getJavaDownloadUrl(javaVersion);
        const zipPath = path.join(this.javaDir, `java-${javaVersion}.zip`);
        const extractPath = path.join(this.javaDir, `jdk-${javaVersion}`);

        try {
            // Descargar
            await this.downloadFile(downloadUrl, zipPath);

            // Extraer
            await this.extractZip(zipPath, this.javaDir);

            // Eliminar zip
            fs.unlinkSync(zipPath);

            // Buscar el ejecutable
            const javaExe = process.platform === 'win32' ? 'java.exe' : 'java';
            const javaBin = this.findJavaInDirectory(this.javaDir, javaExe);

            if (javaBin) {
                console.log('[JavaManager] Java descargado exitosamente:', javaBin);
                return javaBin;
            } else {
                throw new Error('No se pudo encontrar el ejecutable de Java después de la descarga');
            }
        } catch (e) {
            console.error('[JavaManager] Error descargando Java:', e);
            throw new Error(`No se pudo descargar Java: ${e.message}`);
        }
    }

    /**
     * Determina qué versión de Java se necesita según la versión de Minecraft
     */
    getRequiredJavaVersion(minecraftVersion) {
        // Minecraft 1.18+ requiere Java 17
        // Minecraft 1.17 requiere Java 16
        // Minecraft 1.16 y anteriores usan Java 8

        if (!minecraftVersion) return 17;

        const versionNum = parseFloat(minecraftVersion);

        if (versionNum >= 1.18) return 17;
        if (versionNum >= 1.17) return 17; // Usar 17 para compatibilidad
        return 17; // Por defecto usar 17 (compatible con versiones antiguas)
    }

    /**
     * Obtiene la URL de descarga de Java
     */
    getJavaDownloadUrl(version) {
        const platform = process.platform;
        const arch = process.arch === 'x64' ? 'x64' : 'x86';

        // URLs de Adoptium (Eclipse Temurin) - JRE (más ligero que JDK)
        const urls = {
            win32: `https://api.adoptium.net/v3/binary/latest/${version}/ga/windows/${arch}/jre/hotspot/normal/eclipse`,
            darwin: `https://api.adoptium.net/v3/binary/latest/${version}/ga/mac/${arch}/jre/hotspot/normal/eclipse`,
            linux: `https://api.adoptium.net/v3/binary/latest/${version}/ga/linux/${arch}/jre/hotspot/normal/eclipse`
        };

        return urls[platform] || urls.win32;
    }

    /**
     * Descarga un archivo
     */
    downloadFile(url, destPath) {
        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(destPath);

            const request = (currentUrl) => {
                https.get(currentUrl, (response) => {
                    // Manejar redirecciones
                    if (response.statusCode === 302 || response.statusCode === 301) {
                        file.close();
                        fs.unlinkSync(destPath);
                        return request(response.headers.location);
                    }

                    if (response.statusCode !== 200) {
                        reject(new Error(`Error descargando: ${response.statusCode}`));
                        return;
                    }

                    response.pipe(file);

                    file.on('finish', () => {
                        file.close();
                        resolve();
                    });
                }).on('error', (err) => {
                    fs.unlinkSync(destPath);
                    reject(err);
                });
            };

            request(url);
        });
    }

    /**
     * Extrae un archivo ZIP
     */
    extractZip(zipPath, destPath) {
        return new Promise((resolve, reject) => {
            fs.createReadStream(zipPath)
                .pipe(Extract({ path: destPath }))
                .on('close', resolve)
                .on('error', reject);
        });
    }

    /**
     * Busca recursivamente el ejecutable de Java en un directorio
     */
    findJavaInDirectory(dir, javaExe) {
        try {
            const items = fs.readdirSync(dir);

            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    // Buscar en bin/java
                    const binPath = path.join(fullPath, 'bin', javaExe);
                    if (fs.existsSync(binPath)) {
                        return binPath;
                    }

                    // Buscar recursivamente
                    const found = this.findJavaInDirectory(fullPath, javaExe);
                    if (found) return found;
                }
            }
        } catch (e) {
            // Ignorar errores de permisos
        }

        return null;
    }
}

module.exports = JavaManager;
