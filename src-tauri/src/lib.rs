use tauri_plugin_sql::{Migration, MigrationKind};

/// Database file in the app data directory, shared with the front end's `Database.load`.
const DATABASE: &str = "sqlite:steam-inventory-board.db";

fn migrations() -> Vec<Migration> {
  vec![Migration {
    version: 1,
    description: "create_cache_tables",
    sql: include_str!("../../src/data/schema.sql"),
    kind: MigrationKind::Up,
  }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_sql::Builder::default().add_migrations(DATABASE, migrations()).build())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while building tauri application");
}
