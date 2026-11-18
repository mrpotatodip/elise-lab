fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    std::process::exit(elise_runner_cli::main(&args) as i32);
}
