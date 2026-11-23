use std::process::{Command, Stdio};

fn set(name: &str) -> bool {
    std::env::var_os(name).is_some_and(|value| !value.is_empty())
}

fn opener() -> Option<&'static str> {
    if set("SSH_CONNECTION") {
        return None;
    }
    if cfg!(windows) {
        Some("rundll32")
    } else if cfg!(target_os = "macos") {
        Some("open")
    } else if set("DISPLAY") || set("WAYLAND_DISPLAY") {
        Some("xdg-open")
    } else {
        None
    }
}

pub fn open(url: &str) -> bool {
    let Some(program) = opener() else {
        return false;
    };
    let mut command = Command::new(program);
    // rundll32 takes the URL as its second argument, and unlike `cmd /C start` leaves & alone.
    if cfg!(windows) {
        command.arg("url.dll,FileProtocolHandler");
    }
    command.arg(url).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null()).spawn().is_ok()
}
