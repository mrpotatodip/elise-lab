// `elise-runner`: the headless Runner. Everything is in the library; this only hands it the
// command line and exits with the code it returns.

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    std::process::exit(elise_runner_cli::main(&args) as i32);
}
