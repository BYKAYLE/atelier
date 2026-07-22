#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    let args = std::env::args().collect::<Vec<_>>();
    if args.iter().any(|arg| arg == "--atelier-pty-supervisor") {
        if let Err(error) = atelier_lib::run_pty_supervisor() {
            eprintln!("Atelier PTY supervisor failed: {error}");
            std::process::exit(1);
        }
        return;
    }
    if let Some(index) = args
        .iter()
        .position(|arg| arg == "--atelier-oauth-browser-probe")
    {
        let provider = args.get(index + 1).map(String::as_str).unwrap_or("codex");
        if let Err(error) = atelier_lib::run_oauth_browser_probe(provider) {
            eprintln!("Atelier OAuth browser probe failed: {error}");
            std::process::exit(1);
        }
        return;
    }
    let browser_url = args
        .iter()
        .position(|arg| arg == "--atelier-oauth-open-url")
        .and_then(|index| args.get(index + 1))
        .or_else(|| (args.len() == 2 && args[1].starts_with("https://")).then(|| &args[1]));
    if let Some(url) = browser_url {
        if let Err(error) = atelier_lib::run_oauth_browser_url(url) {
            eprintln!("Atelier OAuth browser helper failed: {error}");
            std::process::exit(1);
        }
        return;
    }
    if args.iter().any(|arg| arg == "--atelier-version-probe") {
        println!("{}", env!("CARGO_PKG_VERSION"));
        return;
    }
    if args
        .iter()
        .any(|arg| arg == "--atelier-renderer-ready-probe")
    {
        if let Err(error) = atelier_lib::run_renderer_ready_probe() {
            eprintln!("Atelier renderer readiness probe failed: {error}");
            std::process::exit(1);
        }
        return;
    }
    if let Some(result) = atelier_lib::run_atelier_cli(&args) {
        if let Err(error) = result {
            eprintln!("Atelier CLI failed: {error}");
            std::process::exit(2);
        }
        return;
    }
    atelier_lib::run();
}
