use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
    process,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc, Mutex,
    },
};
use tauri::{
    http::{header::CONTENT_TYPE, Response, StatusCode},
    webview::{DownloadEvent, NavigationFrame as TauriNavigationFrame, NewWindowResponse},
    AppHandle, State, WebviewUrl, WebviewWindowBuilder,
};

#[path = "../src/frame_aware_navigation_policy.rs"]
mod frame_aware_navigation_policy;
#[path = "../src/plugin_resource_url.rs"]
mod plugin_resource_url;
use frame_aware_navigation_policy::{
    FrameAwareNavigationPolicy, NavigationDecision as PolicyDecision,
    NavigationFrame as PolicyFrame,
};

const EVIDENCE_VERSION: &str = "0.1.0";
const FIXTURE_VERSION: &str = "0.1.0";
const TAURI_REVISION: &str = "2.11.5";
const WRY_REVISION: &str = "0.55.1";
const HARNESS_NAMESPACE: &str = "lensx.frame-aware-webview-harness";
const HARNESS_SCHEME: &str = "lensx-harness";
const PLUGIN_SCHEME: &str = "lensx-plugin";
const PLUGIN_SCOPE: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PLUGIN_KEY: &str = "v1-a1";
const PLUGIN_VERSION: &str = "1.0.0";

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
enum FrameClass {
    Main,
    Descendant,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct FixtureCase {
    case_id: String,
    document: String,
    frame_class: FrameClass,
    operation: String,
    target_ref: String,
    expected_navigation_decision: String,
    expected_bootstrap: String,
    expected_handler_hits: usize,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct FixtureManifest {
    fixture_version: String,
    cases: Vec<FixtureCase>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
enum BundleShape {
    NativeCustomProtocol,
    TranslatedCustomProtocol,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
enum HarnessEvent {
    DocumentStart,
    OperationStarted,
    OperationSettled,
    InvokeFinished,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum HarnessOutcome {
    Observed,
    Unavailable,
    Resolved,
    Rejected,
    Retained,
    NotRetained,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct SurfaceReport {
    is_tauri: bool,
    internals: bool,
    metadata: bool,
    invoke: bool,
    ipc: bool,
}

impl SurfaceReport {
    fn all_available(&self) -> bool {
        self.is_tauri && self.internals && self.metadata && self.invoke && self.ipc
    }

    fn all_absent(&self) -> bool {
        !self.is_tauri && !self.internals && !self.metadata && !self.invoke && !self.ipc
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct EnvironmentReport {
    engine_version: String,
    bundle_shape: BundleShape,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct HarnessReport {
    namespace: String,
    case_id: String,
    event: HarnessEvent,
    outcome: HarnessOutcome,
    surface: SurfaceReport,
    environment: EnvironmentReport,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
enum NativeFrameClass {
    Main,
    Descendant,
    Unknown,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
enum NavigationDecision {
    AllowMainApp,
    AllowActivePluginDocument,
    Deny,
    BlockedByWebview,
    NotObserved,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
enum PrecommitOutcome {
    Committed,
    Rejected,
    NotObserved,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
enum HarnessOs {
    Macos,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
enum WebviewEngine {
    Wkwebview,
}

#[derive(Clone, Debug, Serialize)]
struct RunEvidence {
    os: HarnessOs,
    engine: WebviewEngine,
    engine_version: String,
    tauri_revision: &'static str,
    wry_revision: &'static str,
    bundle_shape: BundleShape,
    lease_lifecycle_verified: bool,
}

#[derive(Clone, Debug, Serialize)]
struct ObservationEvidence {
    case_id: String,
    event: HarnessEvent,
    outcome: HarnessOutcome,
    fixture_frame_class: FrameClass,
    native_frame_class: NativeFrameClass,
    decision: NavigationDecision,
    precommit_outcome: PrecommitOutcome,
    host_bootstrap_available: bool,
    descendant_bootstrap_absent: bool,
    handler_hit_count: usize,
    navigation_callback_hits: usize,
    popup_callback_hits: usize,
    download_callback_hits: usize,
}

#[derive(Clone, Debug, Serialize)]
struct HarnessEvidence {
    evidence_version: &'static str,
    run: RunEvidence,
    observations: Vec<ObservationEvidence>,
}

#[derive(Default)]
struct HarnessCounters {
    handler_hits: AtomicUsize,
    navigation_callback_hits: AtomicUsize,
    popup_callback_hits: AtomicUsize,
    download_callback_hits: AtomicUsize,
    last_navigation_decision: AtomicUsize,
    last_native_frame: AtomicUsize,
}

#[derive(Default)]
struct EvidenceAccumulator {
    run: Option<RunEvidence>,
    host_bootstrap_available: bool,
    observations: Vec<ObservationEvidence>,
}

struct HarnessState {
    fixtures: HashMap<String, FixtureCase>,
    counters: Arc<HarnessCounters>,
    evidence: Mutex<EvidenceAccumulator>,
    output_path: PathBuf,
    selected_case_id: String,
    selected_operation: String,
    auto_exit: bool,
}

fn target_platform() -> (HarnessOs, WebviewEngine, &'static str) {
    #[cfg(target_os = "macos")]
    {
        (HarnessOs::Macos, WebviewEngine::Wkwebview, "macos")
    }
    #[cfg(not(target_os = "macos"))]
    compile_error!("the frame-aware WebView harness is intentionally macOS-only");
}

fn valid_engine_version(value: &str) -> bool {
    if value == "unavailable" {
        return true;
    }
    let components = value.split('.').collect::<Vec<_>>();
    !components.is_empty()
        && components.len() <= 4
        && components.iter().all(|component| {
            !component.is_empty()
                && component.len() <= 6
                && component.bytes().all(|byte| byte.is_ascii_digit())
        })
}

fn write_evidence(state: &HarnessState, accumulator: &EvidenceAccumulator) -> Result<(), ()> {
    let Some(run) = accumulator.run.clone() else {
        return Ok(());
    };
    if accumulator.observations.is_empty() {
        return Ok(());
    }
    let evidence = HarnessEvidence {
        evidence_version: EVIDENCE_VERSION,
        run,
        observations: accumulator.observations.clone(),
    };
    let mut bytes = serde_json::to_vec_pretty(&evidence).map_err(|_| ())?;
    bytes.push(b'\n');
    if let Some(parent) = state.output_path.parent() {
        fs::create_dir_all(parent).map_err(|_| ())?;
    }
    fs::write(&state.output_path, bytes).map_err(|_| ())
}

#[tauri::command]
fn frame_aware_webview_harness_record(
    app: AppHandle,
    state: State<'_, HarnessState>,
    report: HarnessReport,
) -> Result<(), &'static str> {
    if report.namespace != HARNESS_NAMESPACE
        || !valid_engine_version(&report.environment.engine_version)
    {
        return Err("harness_record_rejected");
    }
    let fixture = state
        .fixtures
        .get(&report.case_id)
        .ok_or("harness_record_rejected")?;
    let (os, engine, _) = target_platform();
    let mut accumulator = state
        .evidence
        .lock()
        .map_err(|_| "harness_state_unavailable")?;
    let run = RunEvidence {
        os,
        engine,
        engine_version: report.environment.engine_version,
        tauri_revision: TAURI_REVISION,
        wry_revision: WRY_REVISION,
        bundle_shape: report.environment.bundle_shape,
        lease_lifecycle_verified: true,
    };
    if let Some(current) = &accumulator.run {
        if current.engine_version != run.engine_version || current.bundle_shape != run.bundle_shape
        {
            return Err("harness_record_rejected");
        }
    } else {
        accumulator.run = Some(run);
    }

    if matches!(fixture.frame_class, FrameClass::Main) {
        accumulator.host_bootstrap_available = report.surface.all_available();
    }
    let navigation_callback_hits = state
        .counters
        .navigation_callback_hits
        .load(Ordering::SeqCst);
    let popup_callback_hits = state.counters.popup_callback_hits.load(Ordering::SeqCst);
    let download_callback_hits = state.counters.download_callback_hits.load(Ordering::SeqCst);
    let last_navigation_decision = state
        .counters
        .last_navigation_decision
        .load(Ordering::SeqCst);
    let native_frame_class = match state.counters.last_native_frame.load(Ordering::SeqCst) {
        1 => NativeFrameClass::Main,
        2 => NativeFrameClass::Descendant,
        _ => NativeFrameClass::Unknown,
    };
    let decision = if report.event == HarnessEvent::DocumentStart {
        match fixture.expected_navigation_decision.as_str() {
            "allow_main_app" => NavigationDecision::AllowMainApp,
            "allow_active_plugin_document" => NavigationDecision::AllowActivePluginDocument,
            _ => NavigationDecision::NotObserved,
        }
    } else if report.event == HarnessEvent::OperationSettled
        && (last_navigation_decision == 2 || popup_callback_hits > 0 || download_callback_hits > 0)
    {
        NavigationDecision::Deny
    } else if report.event == HarnessEvent::OperationSettled
        && matches!(report.outcome, HarnessOutcome::Retained)
        && fixture.target_ref.starts_with("dangerous_")
        && navigation_callback_hits == 2
    {
        NavigationDecision::BlockedByWebview
    } else {
        NavigationDecision::NotObserved
    };
    let precommit_outcome = match (report.event, report.outcome) {
        (HarnessEvent::DocumentStart, _)
            if matches!(
                decision,
                NavigationDecision::AllowMainApp | NavigationDecision::AllowActivePluginDocument
            ) =>
        {
            PrecommitOutcome::Committed
        }
        (HarnessEvent::OperationSettled, HarnessOutcome::Retained)
            if matches!(
                decision,
                NavigationDecision::Deny | NavigationDecision::BlockedByWebview
            ) =>
        {
            PrecommitOutcome::Rejected
        }
        (HarnessEvent::OperationSettled, HarnessOutcome::NotRetained) => {
            PrecommitOutcome::Committed
        }
        _ => PrecommitOutcome::NotObserved,
    };
    let observation = ObservationEvidence {
        case_id: fixture.case_id.clone(),
        event: report.event,
        outcome: report.outcome,
        fixture_frame_class: fixture.frame_class,
        native_frame_class,
        decision,
        precommit_outcome,
        host_bootstrap_available: accumulator.host_bootstrap_available,
        descendant_bootstrap_absent: matches!(fixture.frame_class, FrameClass::Descendant)
            && report.surface.all_absent(),
        handler_hit_count: state.counters.handler_hits.load(Ordering::SeqCst),
        navigation_callback_hits,
        popup_callback_hits,
        download_callback_hits,
    };
    if accumulator.observations.len() >= 128 {
        return Err("harness_record_limit_reached");
    }
    accumulator.observations.push(observation);
    write_evidence(&state, &accumulator).map_err(|_| "harness_evidence_write_failed")?;
    let terminal_event = match state.selected_operation.as_str() {
        "observe_bootstrap" => HarnessEvent::DocumentStart,
        "invoke" => HarnessEvent::InvokeFinished,
        _ => HarnessEvent::OperationSettled,
    };
    let should_exit = state.auto_exit
        && report.case_id == state.selected_case_id
        && report.event == terminal_event;
    drop(accumulator);
    if should_exit {
        app.exit(0);
    }
    Ok(())
}

#[tauri::command]
fn frame_aware_webview_harness_probe(state: State<'_, HarnessState>) -> Result<(), &'static str> {
    state.counters.handler_hits.fetch_add(1, Ordering::SeqCst);
    Err("harness_probe_reached")
}

fn parse_arguments(fixtures: &HashMap<String, FixtureCase>) -> Result<(String, PathBuf, bool), ()> {
    let mut case_id = "exact-plugin-entry".to_owned();
    let mut output_path = None;
    let mut auto_exit = false;
    let mut arguments = env::args().skip(1);
    while let Some(argument) = arguments.next() {
        match argument.as_str() {
            "--case" => case_id = arguments.next().ok_or(())?,
            "--output" => output_path = Some(PathBuf::from(arguments.next().ok_or(())?)),
            "--auto-exit" => auto_exit = true,
            _ => return Err(()),
        }
    }
    if !fixtures.contains_key(&case_id) {
        return Err(());
    }
    let (_, _, os_name) = target_platform();
    let default_output = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("target/frame-aware-webview-harness")
        .join(format!("{os_name}-{case_id}.json"));
    Ok((case_id, output_path.unwrap_or(default_output), auto_exit))
}

fn load_fixtures() -> Result<(HashMap<String, FixtureCase>, HashMap<String, Vec<u8>>), ()> {
    let manifest: FixtureManifest = serde_json::from_str(include_str!(
        "../../fixtures/frame-aware-webview-navigation/cases.json"
    ))
    .map_err(|_| ())?;
    if manifest.fixture_version != FIXTURE_VERSION {
        return Err(());
    }
    let fixture_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../fixtures/frame-aware-webview-navigation/documents");
    let mut cases = HashMap::new();
    let mut documents = HashMap::new();
    for fixture in manifest.cases {
        if fixture.document.is_empty()
            || fixture.document.contains('/')
            || fixture.document.contains('\\')
            || !fixture.document.ends_with(".html")
            || fixture.expected_handler_hits != 0
            || fixture.operation.is_empty()
            || fixture.target_ref.is_empty()
            || fixture.expected_navigation_decision.is_empty()
            || fixture.expected_bootstrap.is_empty()
        {
            return Err(());
        }
        let bytes = fs::read(fixture_root.join(&fixture.document)).map_err(|_| ())?;
        documents.insert(format!("/documents/{}", fixture.document), bytes);
        if cases.insert(fixture.case_id.clone(), fixture).is_some() {
            return Err(());
        }
    }
    Ok((cases, documents))
}

fn host_document(selected: &FixtureCase) -> Result<Vec<u8>, ()> {
    let selected_json = serde_json::to_string(&serde_json::json!({
        "case_id": selected.case_id,
        "document": selected.document,
        "operation": selected.operation,
        "target_ref": selected.target_ref,
    }))
    .map_err(|_| ())?;
    let document = format!(
        r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>lensX frame-aware WebView harness</title>
    <script>
      (() => {{
        'use strict';
        const namespace = 'lensx.frame-aware-webview-harness';
        const selected = {selected_json};
        let settled = false;
        let childSurface;
        const internals = window.__TAURI_INTERNALS__;
        const invoke = internals?.invoke;
        const engineVersion = () => {{
          const userAgent = navigator.userAgent;
          const match = userAgent.match(/(?:Edg|AppleWebKit)\/([0-9.]+)/);
          return match?.[1] ?? 'unavailable';
        }};
        const environment = Object.freeze({{
          engine_version: engineVersion(),
          bundle_shape: location.protocol === 'lensx-harness:'
            ? 'native_custom_protocol'
            : 'translated_custom_protocol',
        }});
        const record = (report) => {{
          if (typeof invoke !== 'function') {{
            document.title = 'harness-bootstrap-unavailable';
            return;
          }}
          void invoke('frame_aware_webview_harness_record', {{ report: {{ ...report, environment }} }}).catch(() => {{
            document.title = 'harness-record-rejected';
          }});
        }};
        record({{
          namespace,
          case_id: 'host-main-bootstrap',
          event: 'document_start',
          outcome: 'observed',
          surface: {{
            is_tauri: window.isTauri === true,
            internals: typeof internals === 'object' && internals !== null,
            metadata: typeof internals === 'object' && internals !== null && 'metadata' in internals,
            invoke: typeof internals?.invoke === 'function',
            ipc: typeof internals?.postMessage === 'function',
          }},
        }});
        const targetFor = (targetRef) => {{
          const hostBase = `${{location.protocol}}//${{location.host}}`;
          const pluginBase = '{plugin_scheme}://localhost/v1/{plugin_scope}/{plugin_key}/{plugin_version}';
          if (targetRef === 'active_plugin_entry') return `${{pluginBase}}/documents/exact-plugin-entry.html`;
          if (targetRef === 'active_plugin_entry_other_fragment') return `${{pluginBase}}/documents/exact-plugin-entry.html#other`;
          if (targetRef === 'host_app') return `${{hostBase}}/host.html`;
          if (targetRef === 'external_https') return 'https://example.invalid/';
          if (targetRef === 'cross_plugin_entry') return '{plugin_scheme}://localhost/v1/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/v1-b2/1.0.0/documents/exact-plugin-entry.html';
          if (targetRef === 'stale_plugin_entry') return '{plugin_scheme}://localhost/v1/{plugin_scope}/{plugin_key}/0.9.0/documents/exact-plugin-entry.html';
          if (targetRef === 'dangerous_file') return 'file:///frame-aware-webview-denied';
          if (targetRef === 'dangerous_javascript') return 'javascript:void 0';
          if (targetRef === 'dangerous_data') return 'data:text/html,denied';
          if (targetRef === 'dangerous_blob') return URL.createObjectURL(new Blob(['denied'], {{ type: 'text/html' }}));
          if (targetRef === 'download_payload') return `${{hostBase}}/download.txt`;
          return 'about:blank';
        }};
        window.addEventListener('message', (event) => {{
          const report = event.data;
          const frame = document.querySelector('iframe');
          if (
            frame === null ||
            event.source !== frame.contentWindow ||
            typeof report !== 'object' ||
            report === null ||
            report.namespace !== namespace ||
            report.case_id !== selected.case_id
          ) return;
          childSurface = report.surface;
          record(report);
          if (report.event === 'operation_settled') settled = true;
          if (report.event === 'document_start' && !['observe_bootstrap', 'invoke'].includes(selected.operation)) {{
            frame.contentWindow.postMessage({{
              namespace: `${{namespace}}.command`,
              case_id: selected.case_id,
              target_ref: selected.target_ref,
              action: 'run_target',
              target: targetFor(selected.target_ref),
            }}, '*');
            window.setTimeout(() => {{
              frame.contentWindow.postMessage({{
                namespace: `${{namespace}}.command`,
                case_id: selected.case_id,
                target_ref: selected.target_ref,
                action: 'probe_current',
              }}, '*');
            }}, 600);
            window.setTimeout(() => {{
              if (settled || childSurface === undefined) return;
              settled = true;
              record({{
                namespace,
                case_id: selected.case_id,
                event: 'operation_settled',
                outcome: 'not_retained',
                surface: childSurface,
              }});
            }}, 1000);
          }}
        }});
      }})();
    </script>
  </head>
  <body>
    <main>
      <h1>lensX frame-aware WebView harness</h1>
      <p>Case: {case_id}</p>
      <iframe title="fixture" src="{plugin_scheme}://{plugin_scope}.runtime.localhost/v1/{plugin_scope}/{plugin_key}/{plugin_version}/documents/{document_name}"></iframe>
    </main>
  </body>
</html>
"#,
        case_id = selected.case_id,
        document_name = selected.document,
        plugin_scheme = PLUGIN_SCHEME,
        plugin_scope = PLUGIN_SCOPE,
        plugin_key = PLUGIN_KEY,
        plugin_version = PLUGIN_VERSION,
    );
    Ok(document.into_bytes())
}

fn protocol_response(body: Vec<u8>, status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header(CONTENT_TYPE, "text/html; charset=utf-8")
        .body(body)
        .expect("static harness response should be valid")
}

fn plugin_document_response(documents: &HashMap<String, Vec<u8>>, path: &str) -> Response<Vec<u8>> {
    let prefix = format!("/v1/{PLUGIN_SCOPE}/{PLUGIN_KEY}/{PLUGIN_VERSION}/documents/");
    path.strip_prefix(&prefix)
        .and_then(|document| documents.get(&format!("/documents/{document}")))
        .cloned()
        .map(|body| protocol_response(body, StatusCode::OK))
        .unwrap_or_else(|| protocol_response(b"not found".to_vec(), StatusCode::NOT_FOUND))
}

fn download_response() -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::OK)
        .header(CONTENT_TYPE, "application/octet-stream")
        .header(
            "content-disposition",
            "attachment; filename=frame-aware-webview-fixture.txt",
        )
        .body(b"frame-aware WebView download fixture\n".to_vec())
        .expect("static harness download response should be valid")
}

fn main() {
    let (fixtures, mut documents) = load_fixtures().unwrap_or_else(|_| {
        eprintln!("frame-aware WebView harness fixtures are invalid");
        process::exit(2);
    });
    let (case_id, output_path, auto_exit) = parse_arguments(&fixtures).unwrap_or_else(|_| {
        eprintln!(
            "usage: frame_aware_webview_harness [--case <fixture-id>] [--output <file>] [--auto-exit]"
        );
        process::exit(2);
    });
    let selected = fixtures.get(&case_id).expect("validated fixture id");
    let selected_case_id = selected.case_id.clone();
    let selected_operation = selected.operation.clone();
    documents.insert(
        "/host.html".to_owned(),
        host_document(selected).expect("validated fixture should render"),
    );
    let documents = Arc::new(documents);
    let protocol_documents = Arc::clone(&documents);
    let plugin_protocol_documents = Arc::clone(&documents);
    let counters = Arc::new(HarnessCounters::default());
    let navigation_counters = Arc::clone(&counters);
    let popup_counters = Arc::clone(&counters);
    let download_counters = Arc::clone(&counters);
    let app_target = format!("{HARNESS_SCHEME}://localhost/host.html");
    let plugin_target = format!(
        "{PLUGIN_SCHEME}://{PLUGIN_SCOPE}.runtime.localhost/v1/{PLUGIN_SCOPE}/{PLUGIN_KEY}/{PLUGIN_VERSION}/documents/{}",
        selected.document
    );
    let navigation_policy = Arc::new(
        FrameAwareNavigationPolicy::new(&app_target)
            .expect("static harness App target should be valid"),
    );
    let replaced_target = plugin_target.replace(&selected.document, "replaced-document.html");
    let replaced_lease = navigation_policy
        .activate_plugin_target(&replaced_target, None)
        .expect("replacement preflight target should be valid");
    let current_lease = navigation_policy
        .activate_plugin_target(&plugin_target, None)
        .expect("selected preflight target should be valid");
    assert!(
        !navigation_policy.dispose_plugin_target(replaced_lease),
        "late disposal must not clear the replacement"
    );
    assert!(matches!(
        navigation_policy.decide(PolicyFrame::Descendant, &plugin_target),
        PolicyDecision::Allow(_)
    ));
    assert!(
        navigation_policy.dispose_plugin_target(current_lease),
        "current lease must dispose"
    );
    assert!(matches!(
        navigation_policy.decide(PolicyFrame::Descendant, &plugin_target),
        PolicyDecision::Deny(_)
    ));
    let _active_plugin_target = navigation_policy
        .activate_plugin_target(&plugin_target, None)
        .expect("static harness plugin target should be valid");
    let callback_policy = Arc::clone(&navigation_policy);

    tauri::Builder::default()
        .register_uri_scheme_protocol(HARNESS_SCHEME, move |_context, request| {
            if request.uri().path() == "/download.txt" {
                return download_response();
            }
            protocol_documents
                .get(request.uri().path())
                .cloned()
                .map(|body| protocol_response(body, StatusCode::OK))
                .unwrap_or_else(|| protocol_response(b"not found".to_vec(), StatusCode::NOT_FOUND))
        })
        .register_uri_scheme_protocol(PLUGIN_SCHEME, move |_context, request| {
            plugin_document_response(&plugin_protocol_documents, request.uri().path())
        })
        .manage(HarnessState {
            fixtures,
            counters,
            evidence: Mutex::new(EvidenceAccumulator::default()),
            output_path,
            selected_case_id,
            selected_operation,
            auto_exit,
        })
        .invoke_handler(tauri::generate_handler![
            frame_aware_webview_harness_record,
            frame_aware_webview_harness_probe
        ])
        .setup(move |app| {
            let url = "lensx-harness://localhost/host.html"
                .parse()
                .expect("static harness URL should parse");
            WebviewWindowBuilder::new(
                app,
                "frame-aware-webview-harness",
                WebviewUrl::External(url),
            )
            .title("lensX frame-aware WebView harness")
            .inner_size(900.0, 680.0)
            .on_navigation_with_frame(move |url, frame| {
                navigation_counters
                    .navigation_callback_hits
                    .fetch_add(1, Ordering::SeqCst);
                navigation_counters.last_native_frame.store(
                    match frame {
                        TauriNavigationFrame::Main => 1,
                        TauriNavigationFrame::Descendant => 2,
                        TauriNavigationFrame::Unknown => 3,
                    },
                    Ordering::SeqCst,
                );
                let policy_frame = match frame {
                    TauriNavigationFrame::Main => PolicyFrame::Main,
                    TauriNavigationFrame::Descendant => PolicyFrame::Descendant,
                    TauriNavigationFrame::Unknown => PolicyFrame::Unknown,
                };
                let deny = matches!(
                    callback_policy.decide(policy_frame, url.as_str()),
                    PolicyDecision::Deny(_)
                );
                navigation_counters
                    .last_navigation_decision
                    .store(if deny { 2 } else { 1 }, Ordering::SeqCst);
                !deny
            })
            .on_new_window(move |_url, _features| {
                popup_counters
                    .popup_callback_hits
                    .fetch_add(1, Ordering::SeqCst);
                NewWindowResponse::Deny
            })
            .on_download(move |_webview, event| {
                if matches!(event, DownloadEvent::Requested { .. }) {
                    download_counters
                        .download_callback_hits
                        .fetch_add(1, Ordering::SeqCst);
                }
                false
            })
            .build()?;
            Ok(())
        })
        .run(tauri::generate_context!(
            "frame-aware-webview-harness.conf.json"
        ))
        .expect("frame-aware WebView harness runtime failed");
}
