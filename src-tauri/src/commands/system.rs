use base64::Engine;
use tauri::State;
use crate::db::DbPool;

/// Commande de test : retourne la version de SQLite
#[tauri::command]
pub fn ping(db: State<DbPool>) -> Result<String, String> {
    let conn = db.lock().map_err(|e| e.to_string())?;
    let version: String = conn
        .query_row("SELECT sqlite_version()", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(format!("SQLite {}", version))
}

/// Lit un fichier depuis un chemin absolu et retourne son contenu en base64
#[tauri::command]
pub fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path)
        .map_err(|e| format!("Impossible de lire «{}» : {}", path, e))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&bytes))
}
