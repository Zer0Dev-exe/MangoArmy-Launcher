# 🧪 Testing Auto-Updater - v0.1.3 → v0.1.4

## ✅ Estado Actual

- ✅ v0.1.3 publicada en GitHub
- ✅ v0.1.4 construida localmente
- ✅ Cambio visible: Header dice "0.1.4" en lugar de "1.0.0"

---

## 📋 Pasos para Probar

### 1. Instalar v0.1.3

1. Ve a: https://github.com/Mango-Army/MangoArmy-Launcher/releases/tag/v0.1.3
2. Descarga: `Mango.Army.Launcher.Setup.0.1.3.exe`
3. Instala el launcher
4. **Verifica**: El header debe decir "MANGO ARMY LAUNCHER 1.0.0" (versión antigua)

### 2. Publicar v0.1.4 en GitHub

```powershell
# Commit
git add .
git commit -m "v0.1.4 - Testing auto-updater"
git push

# Tag
git tag v0.1.4
git push origin v0.1.4
```

Luego en GitHub:
1. Ve a: https://github.com/Mango-Army/MangoArmy-Launcher/releases/new
2. Tag: `v0.1.4`
3. Title: `v0.1.4 - Testing`
4. Description: `Testing auto-updater functionality`
5. Sube estos archivos:
   - `dist/Mango Army Launcher Setup 0.1.4.exe`
   - `dist/Mango Army Launcher Setup 0.1.4.exe.blockmap`
6. Publish release

### 3. Probar la Actualización

1. **Abre** el launcher v0.1.3 instalado
2. **Espera** 3-5 segundos
3. **Deberías ver**: Modal de actualización diciendo "Nueva versión 0.1.4 disponible!"
4. **Click** en "Descargar"
5. **Observa**: Barra de progreso de descarga
6. **Cuando termine**: Click en "Instalar ahora"
7. **El launcher se cierra** e instala la nueva versión
8. **Abre** el launcher de nuevo
9. **Verifica**: El header ahora dice "MANGO ARMY LAUNCHER 0.1.4" ✅

---

## 🎯 Qué Esperar

### ✅ Si funciona correctamente:

1. Modal aparece automáticamente después de 3 segundos
2. Muestra "Nueva versión 0.1.4 disponible!"
3. Botón "Descargar" funciona
4. Barra de progreso se muestra
5. Botón "Instalar ahora" aparece cuando termina
6. Launcher se cierra e instala
7. Nueva versión muestra "0.1.4" en el header

### ❌ Si algo falla:

**Modal no aparece:**
- Abre DevTools (Ctrl+Shift+I)
- Ve a Console
- Busca mensajes de "update" o errores
- Verifica que subiste el archivo `.blockmap` a GitHub

**Error al descargar:**
- Verifica que el release sea público
- Asegúrate de que ambos archivos estén en GitHub

**Error al instalar:**
- Cierra completamente el launcher
- Ejecuta como administrador si es necesario

---

## 🔍 Verificación con DevTools

Si quieres ver los logs del auto-updater:

1. Abre el launcher v0.1.3
2. Presiona `Ctrl+Shift+I`
3. Ve a la pestaña Console
4. Busca:
   - `"Checking for updates..."` → Sistema funcionando
   - `"Update available: 0.1.4"` → Actualización detectada
   - `"No updates available"` → No hay actualizaciones (verifica GitHub)

---

## 📝 Comandos Rápidos

```powershell
# Publicar v0.1.4
git add .
git commit -m "v0.1.4 - Testing auto-updater"
git push
git tag v0.1.4
git push origin v0.1.4
```

---

## 🎉 Después del Testing

Una vez que confirmes que funciona:

1. **Puedes dejar** la v0.1.4 como versión actual
2. **O revertir** a v0.1.3 si solo era para testing
3. **Futuras actualizaciones** funcionarán igual:
   - Cambias versión
   - Build
   - Publicas en GitHub
   - Usuarios reciben notificación automática

---

## ⚠️ Importante

- El auto-updater **NO funciona** en `npm run dev`
- Solo funciona con la **versión instalada**
- Siempre sube **ambos archivos**: `.exe` y `.exe.blockmap`
