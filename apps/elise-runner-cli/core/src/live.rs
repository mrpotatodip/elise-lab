use crate::engine::{client, engine_url};
use reqwest::StatusCode;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::Notify;
use tokio::task::JoinHandle;
use tokio::time::{sleep, timeout};

const SEND_EVERY: Duration = Duration::from_millis(2500);
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(5);
const FINISH_TIMEOUT: Duration = Duration::from_secs(3);
const BATCH_MAX: usize = 200;
const UNSENT_MAX: usize = 1000;

#[derive(Default)]
struct Tail {
    offset: u64,
    pending: Vec<u8>,
    unsent: Vec<serde_json::Value>,
    seen: Vec<serde_json::Value>,
    refused: bool,
}

#[derive(Clone)]
pub struct LiveSink {
    tail: Arc<Mutex<Tail>>,
    token: String,
    scan_id: String,
}

tokio::task_local! {
    static SINK: LiveSink;
}

impl LiveSink {
    pub fn new(token: &str, scan_id: &str) -> LiveSink {
        LiveSink { tail: Arc::default(), token: token.to_string(), scan_id: scan_id.to_string() }
    }

    fn with_tail<T>(&self, change: impl FnOnce(&mut Tail) -> T) -> T {
        change(&mut self.tail.lock().unwrap_or_else(|poisoned| poisoned.into_inner()))
    }

    async fn push(&self, file: &Path, last: bool) {
        let mut waiting = self.with_tail(|tail| {
            if tail.refused {
                return Vec::new();
            }
            let fresh = read_new(file, tail, last);
            tail.seen.extend(fresh.iter().cloned());
            tail.unsent.extend(fresh);
            let over = tail.unsent.len().saturating_sub(UNSENT_MAX);
            tail.unsent.drain(..over);
            std::mem::take(&mut tail.unsent)
        });
        while !waiting.is_empty() {
            let batch: Vec<_> = waiting.drain(..waiting.len().min(BATCH_MAX)).collect();
            let answer = client()
                .post(format!("{}/runners/jobs/{}/findings", engine_url(), self.scan_id))
                .bearer_auth(&self.token)
                .timeout(UPLOAD_TIMEOUT)
                .json(&serde_json::json!({ "findings": batch }))
                .send()
                .await;
            match answer.map(|response| response.status()) {
                Ok(StatusCode::CONFLICT) => {
                    self.with_tail(|tail| tail.refused = true);
                    return;
                }
                Ok(status) if status.is_success() || status == StatusCode::BAD_REQUEST => {}
                _ => {
                    waiting.splice(0..0, batch);
                    self.with_tail(|tail| tail.unsent = waiting);
                    return;
                }
            }
        }
    }
}

pub async fn scope<F: std::future::Future>(sink: LiveSink, work: F) -> F::Output {
    SINK.scope(sink, work).await
}

pub struct Follow {
    sink: LiveSink,
    stop: Arc<Notify>,
    task: JoinHandle<()>,
}

pub fn follow(file: &Path) -> Option<Follow> {
    let sink = SINK.try_with(Clone::clone).ok()?;
    let stop = Arc::new(Notify::new());
    let task = tokio::spawn(push_loop(sink.clone(), file.to_path_buf(), stop.clone()));
    Some(Follow { sink, stop, task })
}

impl Follow {
    pub async fn finish(self) -> Vec<serde_json::Value> {
        self.stop.notify_one();
        let mut task = self.task;
        if timeout(FINISH_TIMEOUT, &mut task).await.is_err() {
            task.abort();
        }
        self.sink.with_tail(|tail| std::mem::take(&mut tail.seen))
    }
}

async fn push_loop(sink: LiveSink, file: PathBuf, stop: Arc<Notify>) {
    loop {
        let stopped = tokio::select! {
            _ = sleep(SEND_EVERY) => false,
            _ = stop.notified() => true,
        };
        sink.push(&file, stopped).await;
        if stopped {
            return;
        }
    }
}

fn read_new(file: &Path, tail: &mut Tail, last: bool) -> Vec<serde_json::Value> {
    let Ok(mut open) = std::fs::File::open(file) else {
        return Vec::new();
    };
    if open.seek(SeekFrom::Start(tail.offset)).is_err() {
        return Vec::new();
    }
    let mut fresh = Vec::new();
    if open.read_to_end(&mut fresh).is_err() {
        return Vec::new();
    }
    tail.offset += fresh.len() as u64;
    tail.pending.extend(fresh);
    let mut lines: Vec<Vec<u8>> = tail.pending.split(|byte| *byte == b'\n').map(<[u8]>::to_vec).collect();
    tail.pending = if last { Vec::new() } else { lines.pop().unwrap_or_default() };
    lines.iter().filter_map(|line| record_of(line)).collect()
}

fn record_of(line: &[u8]) -> Option<serde_json::Value> {
    let record: serde_json::Value = serde_json::from_slice(line).ok()?;
    matches!(record["verdict"].as_str()?, "confirmed" | "needs_validation").then_some(record)
}
