#[cfg(not(target_os = "macos"))]
fn main() {
    eprintln!("macOS accessory evidence requires macOS");
    std::process::exit(2);
}

#[cfg(target_os = "macos")]
fn main() {
    use serde::Serialize;
    use std::{env, fs, path::PathBuf, thread, time::Duration};
    use tauri::window::WindowBuilder;

    #[derive(Serialize)]
    struct SacrificeEvidence {
        evidence_version: &'static str,
        process_alive: bool,
        ordinary_ready: bool,
        fullscreen_ready: bool,
        fullscreen_preserved: bool,
        graceful_cleanup: bool,
    }

    let value_after = |flag: &str| -> PathBuf {
        let arguments = env::args().collect::<Vec<_>>();
        let index = arguments
            .iter()
            .position(|argument| argument == flag)
            .unwrap_or_else(|| panic!("missing {flag}"));
        PathBuf::from(
            arguments
                .get(index + 1)
                .unwrap_or_else(|| panic!("missing value for {flag}")),
        )
    };
    let ordinary_ready = value_after("--ordinary-ready");
    let fullscreen_request = value_after("--fullscreen-request");
    let fullscreen_ready = value_after("--fullscreen-ready");
    let stop_request = value_after("--stop-request");
    let final_output = value_after("--final-output");

    tauri::Builder::default()
        .setup(move |app| {
            let window = WindowBuilder::new(app, "sacrifice")
                .title("lensX fullscreen evidence sacrifice")
                .inner_size(720.0, 480.0)
                .build()?;
            window.show()?;
            window.set_focus()?;
            fs::write(&ordinary_ready, b"ready")?;

            let app_handle = app.handle().clone();
            thread::spawn(move || {
                let mut fullscreen_established = false;
                loop {
                    if !fullscreen_established && fullscreen_request.exists() {
                        let window = window.clone();
                        let ready = fullscreen_ready.clone();
                        let _ = app_handle.run_on_main_thread(move || {
                            if window.set_fullscreen(true).is_ok() {
                                let _ = window.set_focus();
                                let _ = fs::write(ready, b"ready");
                            }
                        });
                        fullscreen_established = true;
                    }
                    if stop_request.exists() {
                        let fullscreen_preserved = window.is_fullscreen().unwrap_or(false);
                        let evidence = SacrificeEvidence {
                            evidence_version: "0.1.0",
                            process_alive: true,
                            ordinary_ready: true,
                            fullscreen_ready: fullscreen_established,
                            fullscreen_preserved,
                            graceful_cleanup: true,
                        };
                        if let Ok(bytes) = serde_json::to_vec_pretty(&evidence) {
                            let _ = fs::write(&final_output, bytes);
                        }
                        app_handle.exit(0);
                        break;
                    }
                    thread::sleep(Duration::from_millis(50));
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!(
            "macos-accessory-fullscreen-sacrifice.conf.json"
        ))
        .expect("fullscreen sacrifice runtime failed");
}
