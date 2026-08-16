#![allow(linker_messages)]

use lensx_lib::config_lens_cold_open_harness::{builder, ConfigLensColdOpenHarnessInput};
use std::{env, path::PathBuf, process};

fn main() {
    let mut profile = None;
    let mut candidate = None;
    let mut root = None;
    let mut output = None;
    let mut samples = None;
    let mut arguments = env::args().skip(1);
    while let Some(argument) = arguments.next() {
        let target = match argument.as_str() {
            "--profile" => &mut profile,
            "--candidate" => &mut candidate,
            "--root" => &mut root,
            "--output" => &mut output,
            "--samples" => &mut samples,
            _ => {
                eprintln!("unknown ConfigLens cold-open harness argument");
                process::exit(2);
            }
        };
        *target = arguments.next();
    }
    let input = ConfigLensColdOpenHarnessInput {
        profile: profile.unwrap_or_default(),
        candidate: PathBuf::from(candidate.unwrap_or_default()),
        root: PathBuf::from(root.unwrap_or_default()),
        output: PathBuf::from(output.unwrap_or_default()),
        samples: samples.and_then(|value| value.parse().ok()).unwrap_or(0),
    };
    let result = builder(input).and_then(|builder| {
        builder
            .run(tauri::generate_context!(
                "config-lens-cold-open-harness.conf.json"
            ))
            .map_err(|_| ())
    });
    if result.is_err() {
        process::exit(3);
    }
}
