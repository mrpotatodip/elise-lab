// What every Elise Runner does, apart from drawing a window. The desktop app (`src-tauri`) is a
// shell over it; nothing here depends on Tauri.
//
// - `pairing`: enroll a code, accept or decline it, ask Elise who this Runner is, unpair.
// - `store`: where the Runner's token is kept.
// - `scan`: the claim loop and one Scan from clone to report. Progress goes out through one
//   event callback (`scan::Event`); where `claude`, `node` and the Skill are (`scan::Tools`) comes in.

mod engine;
pub mod pairing;
pub mod scan;
pub mod store;
