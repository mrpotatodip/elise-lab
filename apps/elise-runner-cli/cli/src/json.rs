use crate::Exit;
use serde_json::{json, Map, Value};

pub const SCHEMA_VERSION: u32 = 1;

pub struct Failure<'a> {
    pub code: &'a str,
    pub message: &'a str,
    pub next: &'a str,
}

pub fn result(exit: Exit, fields: Value, failure: Option<Failure>) -> Value {
    let mut object = Map::new();
    object.insert("schemaVersion".into(), json!(SCHEMA_VERSION));
    object.insert("ok".into(), json!(exit == Exit::Ok));
    object.insert("exitCode".into(), json!(exit as i32));
    if let Value::Object(fields) = fields {
        object.extend(fields);
    }
    if let Some(Failure { code, message, next }) = failure {
        object.insert("error".into(), json!({ "code": code, "message": message, "next": next }));
    }
    Value::Object(object)
}

pub fn emit(exit: Exit, fields: Value, failure: Option<Failure>) -> Exit {
    println!("{}", result(exit, fields, failure));
    exit
}

pub fn event(name: &str, scan_id: &str, fields: Value) -> Value {
    let mut object = Map::new();
    object.insert("schemaVersion".into(), json!(SCHEMA_VERSION));
    object.insert("event".into(), json!(name));
    object.insert("scanId".into(), json!(scan_id));
    object.insert("at".into(), json!(elise_runner_core::now_iso()));
    if let Value::Object(fields) = fields {
        object.extend(fields);
    }
    Value::Object(object)
}

pub fn say(json: bool, line: &str) {
    if json {
        eprintln!("{line}");
    } else {
        println!("{line}");
    }
}
