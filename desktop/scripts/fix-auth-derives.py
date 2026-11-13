"""Repair the struct derives and drop the now-unused cookie helper.

The auth patch left two `#[derive(Clone)]` on AgentSession (one orphaned above the doc comment) and no `Clone` on AgentState,
which axum requires for `State<T>`. It also left `cookie_token` referencing the deleted cookie constant.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIB = ROOT / "desktop/src-tauri/src/lib.rs"
source = LIB.read_text(encoding="utf-8")

source = source.replace(
    '''#[derive(Clone)]
/// One handshake, one window. Keyed by the token the agent issued, never by anything the page supplies.
#[derive(Clone)]
struct AgentSession {''',
    '''/// One handshake, one window. Keyed by the token the agent issued, never by anything the page supplies.
#[derive(Clone)]
struct AgentSession {''',
)

source = source.replace(
    '''struct AgentState {
    db: Arc<Mutex<Connection>>,''',
    '''#[derive(Clone)]
struct AgentState {
    db: Arc<Mutex<Connection>>,''',
)

# remove the cookie helper wholesale (from its doc comment through its closing brace)
start = source.find("/// The bearer token on an agent call, if any.")
if start != -1:
    end = source.find("\n}\n", start) + 3
    source = source[:start] + source[end:]
else:
    start = source.find("fn cookie_token(")
    if start != -1:
        end = source.find("\n}\n", start) + 3
        source = source[:start] + source[end:]

LIB.write_text(source, encoding="utf-8", newline="\n")
print("derives repaired, cookie helper removed")
