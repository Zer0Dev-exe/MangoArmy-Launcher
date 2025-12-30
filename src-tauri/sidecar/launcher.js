const { Client, Authenticator } = require('minecraft-launcher-core');
const msmc = require('msmc');
const open = require('open');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const command = args[0];
const data = args[1] ? JSON.parse(args[1]) : {};

// Throttle para no enviar demasiados eventos
let lastProgressTime = 0;
const THROTTLE_MS = 500; // Solo enviar cada 500ms

function sendProgress(type, task, total, percent) {
    const now = Date.now();
    if (now - lastProgressTime < THROTTLE_MS && percent < 100) return;
    lastProgressTime = now;
    
    console.log(JSON.stringify({ 
        type: 'progress', 
        data: { type, task, total, percent: Math.round(percent || 0) }
    }));
}

async function run() {
    if (command === 'launch') {
        const launcher = new Client();
        const options = data;

        sendProgress('Iniciando...', 0, 1, 0);

        // Reducir logs - solo errores importantes
        launcher.on('debug', () => {}); // Ignorar debug
        launcher.on('data', () => {}); // Ignorar data
        
        launcher.on('progress', (e) => {
            const percent = e.total > 0 ? (e.task / e.total) * 100 : 0;
            let typeLabel = 'Descargando';
            
            switch(e.type) {
                case 'assets': typeLabel = 'Assets'; break;
                case 'natives': typeLabel = 'Natives'; break;
                case 'classes': typeLabel = 'Librerías'; break;
                default: typeLabel = e.type || 'Archivos';
            }
            
            sendProgress(typeLabel, e.task || 0, e.total || 0, percent);
        });
        
        launcher.on('close', (code) => {
            console.log(JSON.stringify({ type: 'close', data: code }));
        });
        
        launcher.on('error', (e) => {
            console.log(JSON.stringify({ type: 'error', data: e?.message || e }));
        });

        try {
            let auth;
            if (options.accountType === 'microsoft' && options.userAuth) {
                auth = options.userAuth;
            } else {
                const username = options.username || 'Spartan';
                try {
                    auth = await Authenticator.getAuth(username);
                } catch (e) {
                    auth = {
                        access_token: 'null',
                        client_token: 'null',
                        uuid: '00000000-0000-0000-0000-000000000000',
                        name: username,
                        user_properties: '{}',
                        meta: { type: 'mojang' }
                    };
                }
            }

            // Buscar javaw.exe (Java sin ventana de consola)
            const findJavaw = () => {
                const possiblePaths = [
                    process.env.JAVA_HOME && path.join(process.env.JAVA_HOME, 'bin', 'javaw.exe'),
                    'C:\\Program Files\\Java\\jdk-21\\bin\\javaw.exe',
                    'C:\\Program Files\\Java\\jdk-17\\bin\\javaw.exe',
                    'C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.2.13-hotspot\\bin\\javaw.exe',
                    'C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.10.7-hotspot\\bin\\javaw.exe',
                    'C:\\Program Files (x86)\\Common Files\\Oracle\\Java\\javapath\\javaw.exe'
                ].filter(Boolean);
                
                for (const p of possiblePaths) {
                    if (fs.existsSync(p)) return p;
                }
                return 'javaw'; // Intenta usar el del PATH
            };

            const launchOptions = {
                authorization: auth,
                root: options.root,
                version: {
                    number: options.version,
                    type: options.type === 'fabric' ? 'release' : options.type
                },
                memory: {
                    max: options.memory || '4G',
                    min: '2G'
                },
                // Usar javaw.exe para evitar ventana de consola
                javaPath: findJavaw(),
                // Ocultar ventana de consola en Windows
                overrides: {
                    detached: false
                },
                window: {
                    width: 1280,
                    height: 720
                }
            };

            launcher.launch(launchOptions);
        } catch (err) {
            console.error(JSON.stringify({ type: 'fatal', data: err.message }));
            process.exit(1);
        }
    } else if (command === 'microsoft-login') {
        try {
            // Usar msmc con parámetro de browser para evitar GUI
            const auth = new msmc.Auth('select_account');
            
            // Intentar lanzar sin GUI esperando que use el navegador del sistema
            let result;
            try {
                result = await auth.launch();
            } catch (firstError) {
                // Si falla, intentar con la alternativa de getServer
                console.error('First attempt failed:', firstError.message);
                
                // Intenta directamente obtener token
                const altAuth = new msmc.Auth('select_account');
                result = await altAuth.launch().catch(e => {
                    throw new Error('Auth launch failed: ' + (e.message || e));
                });
            }
            
            const profile = result.profile || result.mcp || {};
            const access_token = result.access_token || result.token?.access_token || '';
            
            if (!access_token) {
                throw new Error('No access token received from Microsoft');
            }
            
            console.log(JSON.stringify({ 
                type: 'auth-success', 
                data: {
                    access_token: access_token,
                    name: profile.name || 'Player',
                    uuid: profile.id || profile.uuid || profile.xuid || '',
                    profile: profile
                }
            }));
            process.exit(0);
        } catch (err) {
            const msg = err && (err.message || err.toString()) ? (err.message || err.toString()) : String(err);
            console.log(JSON.stringify({ type: 'auth-error', data: msg }));
            process.exit(1);
        }
    }
}

process.on('unhandledRejection', (reason) => {
    const msg = reason && (reason.message || reason.toString ? reason.toString() : String(reason));
    console.log(JSON.stringify({ type: 'auth-error', data: msg }));
    process.exit(1);
});

run().catch(err => {
    const msg = err && (err.message || err.toString ? err.toString() : String(err));
    console.log(JSON.stringify({ type: 'auth-error', data: msg }));
    process.exit(1);
});
