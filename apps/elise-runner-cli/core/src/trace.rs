// The Scan's Trace, from this computer. The agent runs with streaming JSON output into its log
// file. A task reads the new lines of that file every few seconds, gives each a label (never
// anything the agent wrote), merges consecutive identical labels into one entry with a count and
// sends the new and grown entries to Elise. Nothing here can fail or hold up a Scan: a line that
// does not parse is passed over and a batch that does not arrive is dropped.

use crate::engine::{client, engine_url};
use serde::Serialize;
use std::collections::BTreeSet;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::Notify;
use tokio::task::JoinHandle;
use tokio::time::{sleep, timeout};

// How often the new lines are read and sent: between 2 and 3 seconds.
const SEND_EVERY: Duration = Duration::from_millis(2500);
// What one upload and the last one at the end of a run may take. A slow engine costs the Scan at most
// the second.
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(5);
const FINISH_TIMEOUT: Duration = Duration::from_secs(2);
// The engine's batch size and its cap per Scan. Entries past the cap are not kept here either.
const BATCH_MAX: usize = 500;
const ENTRIES_MAX: usize = 5000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Label {
    Reasoning,
    ReadingFiles,
    Searching,
    RunningCommand,
    Writing,
    CallingTool,
    PhaseStarted,
    PhaseEnded,
}

impl Label {
    pub fn as_str(self) -> &'static str {
        match self {
            Label::Reasoning => "reasoning",
            Label::ReadingFiles => "reading_files",
            Label::Searching => "searching",
            Label::RunningCommand => "running_command",
            Label::Writing => "writing",
            Label::CallingTool => "calling_tool",
            Label::PhaseStarted => "phase_started",
            Label::PhaseEnded => "phase_ended",
        }
    }
}

// -----
// The labels one line of the agent's output gives, in the order of its content blocks. A thinking or
// text block is Reasoning; a tool call is labelled by the tool's name alone. Tool results, system and
// rate-limit lines, a line type or block type this code does not know, and a line that is not whole
// JSON give nothing. The cloud's classifier reads the same fixture and must agree.
// -----
pub fn classify(line: &str) -> Vec<Label> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
        return Vec::new();
    };
    if value["type"] != "assistant" {
        return Vec::new();
    }
    let Some(blocks) = value["message"]["content"].as_array() else {
        return Vec::new();
    };
    blocks
        .iter()
        .filter_map(|block| match block["type"].as_str()? {
            "thinking" | "text" => Some(Label::Reasoning),
            "tool_use" => Some(tool_label(block["name"].as_str().unwrap_or_default())),
            _ => None,
        })
        .collect()
}

fn tool_label(name: &str) -> Label {
    match name.to_ascii_lowercase().as_str() {
        "read" | "glob" => Label::ReadingFiles,
        "grep" => Label::Searching,
        "bash" => Label::RunningCommand,
        "write" | "edit" | "multiedit" | "notebookedit" => Label::Writing,
        _ => Label::CallingTool,
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Entry {
    id: String,
    label: Label,
    phase: Option<String>,
    started_at: String,
    ended_at: String,
    count: u32,
}

#[derive(Default)]
struct State {
    entries: Vec<Entry>,
    // The entries that are new or grew since the last send, by place in `entries`.
    changed: BTreeSet<usize>,
    // The Phase the agent runs in now: None for a run without Phases.
    phase: Option<String>,
}

impl State {
    // A label the same as the last entry's, in the same Phase, grows that entry.
    fn record(&mut self, label: Label) {
        let now = now_iso();
        let phase = self.phase.clone();
        if let Some(last) = self.entries.last_mut() {
            if last.label == label
                && last.phase == phase
                && !matches!(label, Label::PhaseStarted | Label::PhaseEnded)
            {
                last.count += 1;
                last.ended_at = now;
                let at = self.entries.len() - 1;
                self.changed.insert(at);
                return;
            }
        }
        if self.entries.len() >= ENTRIES_MAX {
            return;
        }
        self.entries.push(Entry {
            id: uuid::Uuid::now_v7().to_string(),
            label,
            phase,
            started_at: now.clone(),
            ended_at: now,
            count: 1,
        });
        self.changed.insert(self.entries.len() - 1);
    }
}

// -----
// What the Scan's runs share: the entries so far, and the address and token to send them with.
// -----
#[derive(Clone)]
pub struct TraceSink {
    state: Arc<Mutex<State>>,
    token: String,
    scan_id: String,
}

tokio::task_local! {
    static SINK: TraceSink;
}

impl TraceSink {
    pub fn new(token: &str, scan_id: &str) -> TraceSink {
        TraceSink {
            state: Arc::default(),
            token: token.to_string(),
            scan_id: scan_id.to_string(),
        }
    }

    fn with_state<T>(&self, change: impl FnOnce(&mut State) -> T) -> T {
        change(
            &mut self
                .state
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()),
        )
    }

    // Sends the entries that changed since the last send, 500 to a request. A failed request is
    // dropped, not retried: an entry that grows is sent again with its next change.
    async fn flush(&self) {
        let changed: Vec<Entry> = self.with_state(|state| {
            let places = std::mem::take(&mut state.changed);
            places
                .into_iter()
                .filter_map(|at| state.entries.get(at).cloned())
                .collect()
        });
        for batch in changed.chunks(BATCH_MAX) {
            let _ = client()
                .post(format!(
                    "{}/runners/jobs/{}/trace",
                    engine_url(),
                    self.scan_id
                ))
                .bearer_auth(&self.token)
                .timeout(UPLOAD_TIMEOUT)
                .json(&serde_json::json!({ "entries": batch }))
                .send()
                .await;
        }
    }
}

// Runs a Scan with a Trace of its own. A run of the agent inside it is followed by `follow`.
pub async fn scope<F: std::future::Future>(sink: TraceSink, work: F) -> F::Output {
    SINK.scope(sink, work).await
}

// -----
// Following one run of the agent: reads the new lines of its log until `finish`, which also ends
// the Phase's entry. There is nothing to follow outside `scope` (a test of the Scan alone).
// -----
pub struct Follow {
    stop: Arc<Notify>,
    task: JoinHandle<()>,
}

pub fn follow(log: &Path, phase: Option<&str>) -> Option<Follow> {
    let sink = SINK.try_with(Clone::clone).ok()?;
    // The repair run is no Phase of the contract: its entries have none.
    let phase = phase.filter(|name| ["recon", "hunt", "check", "report"].contains(name));
    sink.with_state(|state| {
        state.phase = phase.map(str::to_string);
        if phase.is_some() {
            state.record(Label::PhaseStarted);
        }
    });
    let stop = Arc::new(Notify::new());
    let task = tokio::spawn(read_loop(
        sink,
        log.to_path_buf(),
        phase.is_some(),
        stop.clone(),
    ));
    Some(Follow { stop, task })
}

impl Follow {
    // One last read and send, within two seconds: a slow engine never holds the Scan longer.
    pub async fn finish(self) {
        self.stop.notify_one();
        let mut task = self.task;
        if timeout(FINISH_TIMEOUT, &mut task).await.is_err() {
            task.abort();
        }
    }
}

async fn read_loop(sink: TraceSink, log: PathBuf, phased: bool, stop: Arc<Notify>) {
    let mut offset = 0u64;
    let mut pending: Vec<u8> = Vec::new();
    loop {
        let stopped = tokio::select! {
            _ = sleep(SEND_EVERY) => false,
            _ = stop.notified() => true,
        };
        read_new(&log, &mut offset, &mut pending, stopped, &sink);
        if stopped && phased {
            sink.with_state(|state| state.record(Label::PhaseEnded));
        }
        sink.flush().await;
        if stopped {
            return;
        }
    }
}

// Reads what the log gained since `offset`, classifies each whole line and records its labels. At
// the end the last line, which has no newline after it, counts too.
fn read_new(log: &Path, offset: &mut u64, pending: &mut Vec<u8>, last: bool, sink: &TraceSink) {
    let Ok(mut file) = std::fs::File::open(log) else {
        return;
    };
    if file.seek(SeekFrom::Start(*offset)).is_err() {
        return;
    }
    let mut fresh = Vec::new();
    if file.read_to_end(&mut fresh).is_err() {
        return;
    }
    *offset += fresh.len() as u64;
    pending.extend(fresh);
    let mut lines: Vec<Vec<u8>> = pending
        .split(|byte| *byte == b'\n')
        .map(<[u8]>::to_vec)
        .collect();
    // The text after the last newline is a line still being written, until the run is over.
    *pending = if last {
        Vec::new()
    } else {
        lines.pop().unwrap_or_default()
    };
    sink.with_state(|state| {
        for line in &lines {
            for label in classify(&String::from_utf8_lossy(line)) {
                state.record(label);
            }
        }
    });
}

// The time as ISO 8601 in UTC with milliseconds, which the engine's schema reads.
fn now_iso() -> String {
    let since = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let (days, rest) = ((since.as_secs() / 86_400) as i64, since.as_secs() % 86_400);
    // Days since 1970-01-01 to a civil date (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = yoe + era * 400 + i64::from(month <= 2);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        rest / 3600,
        rest % 3600 / 60,
        rest % 60,
        since.subsec_millis()
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURES: &str = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../../packages/contracts/fixtures/trace-classifier"
    );

    // Seam 2: the Runner and the cloud classify the same recorded output the same way.
    #[test]
    fn the_classifier_agrees_with_the_shared_fixture() {
        let stream = std::fs::read_to_string(format!("{FIXTURES}/agent-stream.ndjson")).unwrap();
        let expected: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(format!("{FIXTURES}/agent-stream.expected.json")).unwrap(),
        )
        .unwrap();
        let expected: Vec<Vec<String>> = serde_json::from_value(expected["lines"].clone()).unwrap();

        let given: Vec<Vec<&str>> = stream
            .lines()
            .map(|line| classify(line).into_iter().map(Label::as_str).collect())
            .collect();

        assert_eq!(given, expected);
    }

    #[test]
    fn identical_labels_in_a_row_merge_into_one_entry_that_grows() {
        let mut state = State::default();
        for label in [
            Label::ReadingFiles,
            Label::ReadingFiles,
            Label::Searching,
            Label::ReadingFiles,
        ] {
            state.record(label);
        }

        let counts: Vec<(Label, u32)> = state.entries.iter().map(|e| (e.label, e.count)).collect();
        assert_eq!(
            counts,
            [
                (Label::ReadingFiles, 2),
                (Label::Searching, 1),
                (Label::ReadingFiles, 1)
            ]
        );
    }

    #[test]
    fn the_time_reads_as_iso_8601() {
        let now = now_iso();
        assert!(
            now.len() == 24 && now.ends_with('Z') && now.as_bytes()[10] == b'T',
            "{now}"
        );
    }
}
