use tauri::{AppHandle, Manager, Emitter};
use std::fs;
use serde_json;

#[tauri::command]
fn minimize_window(app: AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.minimize();
  }
}

#[tauri::command]
fn maximize_window(app: AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    if let Ok(is_maximized) = window.is_maximized() {
      if is_maximized {
        let _ = window.unmaximize();
      } else {
        let _ = window.maximize();
      }
    }
  }
}

#[tauri::command]
fn close_window(app: AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.close();
  }
}

#[tauri::command]
fn get_installed_versions(app: AppHandle) -> Vec<String> {
    let mut path = app.path().app_data_dir().unwrap_or_default();
    path.push("minecraft");
    path.push("versions");
    
    if !path.exists() {
        return vec![];
    }
    
    match fs::read_dir(path) {
        Ok(entries) => entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .filter_map(|e| e.file_name().into_string().ok())
            .collect(),
        Err(_) => vec![],
    }
}

#[tauri::command]
async fn launch_minecraft(app: AppHandle, options: serde_json::Value) -> Result<serde_json::Value, String> {
    use std::process::Stdio;
    use std::io::{BufRead, BufReader};
    
    let mut options_with_root = options.clone();
    let mut app_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    app_dir.push("minecraft");
    options_with_root["root"] = serde_json::Value::String(app_dir.to_string_lossy().to_string());

    // Detectar si estamos en desarrollo verificando si launcher.js existe
    let mut dev_sidecar_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    dev_sidecar_path.push("sidecar");
    let launcher_js = dev_sidecar_path.join("launcher.js");
    
    let json_args = serde_json::to_string(&options_with_root).unwrap();
    
    let mut command = if launcher_js.exists() {
        // Modo desarrollo: usar node + launcher.js
        let mut cmd = std::process::Command::new("node");
        cmd.args([launcher_js.to_string_lossy().to_string(), "launch".to_string(), json_args]);
        cmd
    } else {
        // Modo producción: usar sidecar binario
        let sidecar_path = app.path().resource_dir()
            .map_err(|e| e.to_string())?
            .join("launcher.exe");
        let mut cmd = std::process::Command::new(sidecar_path);
        cmd.args(["launch", &json_args]);
        cmd
    };
    
    // Ocultar ventana de consola en Windows
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    
    tauri::async_runtime::spawn(async move {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            if let Ok(line_str) = line {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&line_str) {
                    match json["type"].as_str() {
                        Some("progress") => { let _ = app.emit("launch-progress", &json["data"]); },
                        Some("data") => { /* debug logs */ },
                        Some("close") => { let _ = app.emit("game-closed", ()); },
                        Some("error") => { let _ = app.emit("launch-error", &json["data"]); },
                        _ => {}
                    }
                }
            }
        }
    });

    Ok(serde_json::json!({ "success": true }))
}

fn auth_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let mut path = app.path().app_data_dir().map_err(|e| e.to_string())?;
    path.push("minecraft");
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path)
}

#[tauri::command]
fn check_saved_login(app: AppHandle) -> Option<serde_json::Value> {
    let mut path = auth_dir(&app).ok()?;
    path.push("auth.json");
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str(&content).ok()
}

#[tauri::command]
fn logout(app: AppHandle) -> Result<(), String> {
    let mut path = auth_dir(&app)?;
    path.push("auth.json");
    if path.exists() {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn microsoft_login(_app: AppHandle) -> Result<serde_json::Value, String> {
    // Client ID de PolyMC/ATLauncher (público y funcional)
    let client_id = "499c8d36-be2a-4231-9ebd-ef291b7bb64c";
    
    // Paso 1: Solicitar device code a Microsoft
    let client = reqwest::Client::new();
    let device_code_response: serde_json::Value = client
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode")
        .form(&[
            ("client_id", client_id),
            ("scope", "XboxLive.signin offline_access"),
        ])
        .send()
        .await
        .map_err(|e| format!("Device code request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse device code response: {}", e))?;

    // Debug: imprimir respuesta completa
    println!("Device code response: {:?}", device_code_response);

    // Verificar si hay error
    if let Some(error) = device_code_response.get("error") {
        let error_desc = device_code_response.get("error_description")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown error");
        return Err(format!("Microsoft error: {} - {}", error, error_desc));
    }

    let device_code = device_code_response
        .get("device_code")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("No device_code in response: {:?}", device_code_response))?;
    
    let user_code = device_code_response
        .get("user_code")
        .and_then(|v| v.as_str())
        .ok_or("No user_code in response")?;
    
    let verification_uri = device_code_response
        .get("verification_uri")
        .and_then(|v| v.as_str())
        .ok_or("No verification_uri in response")?;

    println!("Device Code: {}", device_code);
    println!("User Code: {}", user_code);
    println!("Verification URI: {}", verification_uri);
    
    // Retornar información para que el frontend muestre un diálogo
    let response = serde_json::json!({
        "type": "device_code",
        "user_code": user_code,
        "verification_uri": verification_uri,
        "device_code": device_code,
        "message": "Verifica tu cuenta"
    });
    
    Ok(response)
}

#[tauri::command]
async fn complete_microsoft_login(app: AppHandle, device_code: String) -> Result<serde_json::Value, String> {
    let client_id = "499c8d36-be2a-4231-9ebd-ef291b7bb64c";
    let client = reqwest::Client::new();

    // 1. Intercambiar device code por Microsoft token
    let token_response: serde_json::Value = client
        .post("https://login.microsoftonline.com/consumers/oauth2/v2.0/token")
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ("client_id", client_id),
            ("device_code", &device_code),
        ])
        .send()
        .await
        .map_err(|e| format!("Token request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    if let Some(_error) = token_response.get("error") {
        let error_desc = token_response.get("error_description")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown error");
        return Err(format!("OAuth error: {}", error_desc));
    }

    let ms_access_token = token_response
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("No access token in response")?;

    // 2. Autenticar con Xbox Live
    let xbox_auth_response: serde_json::Value = client
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "Properties": {
                "AuthMethod": "RPS",
                "SiteName": "user.auth.xboxlive.com",
                "RpsTicket": format!("d={}", ms_access_token)
            },
            "RelyingParty": "http://auth.xboxlive.com",
            "TokenType": "JWT"
        }))
        .send()
        .await
        .map_err(|e| format!("Xbox Live auth failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse Xbox Live response: {}", e))?;

    let xbox_token = xbox_auth_response
        .get("Token")
        .and_then(|v| v.as_str())
        .ok_or("No Xbox token")?;
    
    let xbox_uhs = xbox_auth_response
        .pointer("/DisplayClaims/xui/0/uhs")
        .and_then(|v| v.as_str())
        .ok_or("No Xbox UHS")?;

    // 3. Obtener XSTS token para Minecraft
    let xsts_response: serde_json::Value = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "Properties": {
                "SandboxId": "RETAIL",
                "UserTokens": [xbox_token]
            },
            "RelyingParty": "rp://api.minecraftservices.com/",
            "TokenType": "JWT"
        }))
        .send()
        .await
        .map_err(|e| format!("XSTS auth failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse XSTS response: {}", e))?;

    if let Some(xerr) = xsts_response.get("XErr") {
        let code = xerr.as_u64().unwrap_or(0);
        let msg = match code {
            2148916233 => "Esta cuenta de Microsoft no tiene Xbox Live. Crea una cuenta Xbox.",
            2148916235 => "Xbox Live no está disponible en tu país.",
            2148916236 | 2148916237 => "Esta cuenta necesita verificación de adulto.",
            2148916238 => "Esta cuenta es de un menor y necesita agregarse a una familia.",
            _ => "Error de autenticación Xbox"
        };
        return Err(msg.to_string());
    }

    let xsts_token = xsts_response
        .get("Token")
        .and_then(|v| v.as_str())
        .ok_or("No XSTS token")?;

    // 4. Autenticar con Minecraft
    let mc_auth_response: serde_json::Value = client
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .header("Content-Type", "application/json")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "identityToken": format!("XBL3.0 x={};{}", xbox_uhs, xsts_token)
        }))
        .send()
        .await
        .map_err(|e| format!("Minecraft auth failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse Minecraft auth response: {}", e))?;

    let mc_access_token = mc_auth_response
        .get("access_token")
        .and_then(|v| v.as_str())
        .ok_or("No Minecraft access token")?;

    // 5. Obtener perfil de Minecraft
    let profile_response: serde_json::Value = client
        .get("https://api.minecraftservices.com/minecraft/profile")
        .header("Authorization", format!("Bearer {}", mc_access_token))
        .send()
        .await
        .map_err(|e| format!("Profile request failed: {}", e))?
        .json()
        .await
        .map_err(|e| format!("Failed to parse profile response: {}", e))?;

    let name = profile_response
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Player");
    
    let uuid = profile_response
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("00000000000000000000000000000000");

    // Retornar respuesta de autenticación
    let response = serde_json::json!({
        "access_token": mc_access_token,
        "name": name,
        "uuid": uuid,
        "profile": profile_response
    });

    // Guardar autenticación
    let mut path = auth_dir(&app)?;
    path.push("auth.json");
    fs::write(&path, serde_json::to_string(&response).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;

    Ok(response)
}

#[tauri::command]
fn get_app_data_dir(app: AppHandle) -> String {
    app.path().app_data_dir().unwrap_or_default().to_string_lossy().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().build())
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![
      minimize_window,
      maximize_window,
      close_window,
      get_installed_versions,
      launch_minecraft,
      microsoft_login,
      complete_microsoft_login,
      get_app_data_dir,
      check_saved_login,
      logout
    ])
    .setup(|_app| {
        Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
