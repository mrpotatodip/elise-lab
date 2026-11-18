use elise_runner_core::pairing::{self, Enrolled, RunnerError, RunnerStatus};
use elise_runner_core::scan::{self, Event, Tools};
use elise_runner_core::store::{KeychainStore, DESKTOP_KEYCHAIN_SERVICE};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager, WindowEvent,
};

static STORE: KeychainStore = KeychainStore::new(DESKTOP_KEYCHAIN_SERVICE);

static PENDING: Mutex<Option<Enrolled>> = Mutex::new(None);

fn take_pending() -> Option<Enrolled> {
    PENDING.lock().expect("the pending pairing is not poisoned").take()
}

// What the page is asked to confirm: the account that made the code and the name it gave this
// runner. The token stays in Rust.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PairingOffer {
    name: String,
    account_name: String,
}

#[derive(Clone, Serialize)]
#[serde(tag = "state", rename_all = "lowercase", rename_all_fields = "camelCase")]
enum Activity {
    Idle,
    Running { repo: String },
    Finished { ok: bool, repo: String, message: String },
}

static ACTIVITY: Mutex<Activity> = Mutex::new(Activity::Idle);

fn on_event(event: Event) {
    let next = match event {
        Event::Claimed { repo, .. } => Activity::Running { repo },
        Event::Ended { ok, repo, message, .. } =>Activity::Finished { ok, repo, message },
        _ => return,
    };
    *ACTIVITY.lock().expect("the activity is not poisoned") = next;
}

// Where `claude`, `node` and the bundled skills are on this computer.
fn find_tools(app: &AppHandle) -> Result<Tools, String> {
    let skills = app
        .path()
        .resource_dir()
        .map_err(|e| format!("Could not find the audit skill inside the app: {e}"))?
        .join("skills");
    Ok(Tools::locate(skills))
}

// Each function below is something the web page can call with `invoke("name")`.
#[tauri::command]
async fn runner_status() -> RunnerStatus {
    pairing::status(&STORE).await
}

#[tauri::command]
async fn pair_runner(code: String) -> Result<PairingOffer, RunnerError> {
    let enrolled = pairing::enroll(&code).await?;
    let offer = PairingOffer {
        name: enrolled.name.clone(),
        account_name: enrolled.account_name.clone(),
    };
    let earlier = PENDING.lock().expect("the pending pairing is not poisoned").replace(enrolled);
    if let Some(earlier) = earlier {
        pairing::decline(earlier).await;
    }
    Ok(offer)
}

#[tauri::command]
async fn accept_pairing() -> Result<RunnerStatus, RunnerError> {
    let pending = take_pending().ok_or(RunnerError::PairingLost)?;
    pairing::accept(&STORE, pending).await
}

#[tauri::command]
async fn decline_pairing() -> Result<RunnerStatus, RunnerError> {
    if let Some(pending) = take_pending() {
        pairing::decline(pending).await;
    }
    Ok(RunnerStatus::Unpaired)
}

#[tauri::command]
async fn unpair_runner() -> Result<RunnerStatus, RunnerError> {
    pairing::unpair(&STORE).await
}

#[tauri::command]
fn runner_activity() -> Activity {
    ACTIVITY.lock().expect("the activity is not poisoned").clone()
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![runner_status, pair_runner, accept_pairing, decline_pairing, unpair_runner, runner_activity])
        .setup(|app| {
            // The work loop asks Elise for scans for as long as the app runs.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let tools = move || find_tools(&handle);
                scan::work_loop(&STORE, &tools, &on_event).await
            });
            let open = MenuItem::with_id(app, "open", "Open Elise Runner", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;

            let mut tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Elise Runner")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;
            Ok(())
        })
        // Closing the window hides it: the Runner keeps running from the tray.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run the Elise Runner");
}
