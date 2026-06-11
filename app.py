"""
app.py
──────
Streamlit wrapper for the premium glassmorphic GeoAI Agricultural Platform.
Bundles index.html, css/styles.css, and local javascript modules into a
single, self-contained HTML page and renders it in a full-screen iframe.
"""

from pathlib import Path
import streamlit as st

st.set_page_config(
    page_title="GeoAI Agricultural Platform",
    page_icon="🌾",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# Custom premium styling resets to remove Streamlit container margins
st.markdown("""
<style>
    /* Hide Streamlit footer but preserve header and menu for deployment */
    footer {visibility: hidden;}
    
    /* Remove wrapper margins but leave top space for Streamlit header */
    div.block-container {
        padding-top: 3.5rem !important;
        padding-bottom: 0rem !important;
        padding-left: 0rem !important;
        padding-right: 0rem !important;
    }
    
    /* Full-screen iframe height */
    iframe {
        border: none !important;
        width: 100% !important;
        height: 100vh !important;
        overflow: hidden !important;
    }
</style>
""", unsafe_allow_html=True)

def get_bundled_html():
    root = Path(__file__).resolve().parent
    
    # 1. Read index.html
    html_path = root / "index.html"
    with open(html_path, "r", encoding="utf-8") as f:
        html_content = f.read()

    # 2. Read css/styles.css
    css_path = root / "css" / "styles.css"
    with open(css_path, "r", encoding="utf-8") as f:
        css_content = f.read()

    # Inline the CSS styles
    html_content = html_content.replace(
        '<link rel="stylesheet" href="css/styles.css">',
        f'<style>{css_content}</style>'
    )

    # 3. Read local JS modules
    js_dir = root / "js"
    with open(js_dir / "uploader.js", "r", encoding="utf-8") as f:
        uploader_js = f.read()
    with open(js_dir / "renderer.js", "r", encoding="utf-8") as f:
        renderer_js = f.read()
    with open(js_dir / "reporter.js", "r", encoding="utf-8") as f:
        reporter_js = f.read()
    with open(js_dir / "app.js", "r", encoding="utf-8") as f:
        app_js = f.read()

    # 4. Clean JS code (strip exports and imports)
    uploader_clean = uploader_js.replace("export class IngestionManager", "class IngestionManager")
    renderer_clean = renderer_js.replace("export class CanvasRenderer", "class CanvasRenderer")
    reporter_clean = reporter_js.replace("export function generateAIReport", "function generateAIReport")

    app_clean = app_js
    imports_to_remove = [
        "import { IngestionManager } from './uploader.js';",
        'import { IngestionManager } from "./uploader.js";',
        "import { CanvasRenderer } from './renderer.js';",
        'import { CanvasRenderer } from "./renderer.js";',
        "import { generateAIReport } from './reporter.js';",
        'import { generateAIReport } from "./reporter.js";',
    ]
    for imp in imports_to_remove:
        app_clean = app_clean.replace(imp, "")

    # 5. Route API requests from iframe to local FastAPI port 8000
    # Replace relative API paths with absolute local uvicorn host
    uploader_clean = uploader_clean.replace('"/api/upload"', '"http://localhost:8000/api/upload"')
    app_clean = app_clean.replace('`/api/pipeline/start/', '`http://localhost:8000/api/pipeline/start/')
    app_clean = app_clean.replace('`/api/pipeline/status/', '`http://localhost:8000/api/pipeline/status/')
    app_clean = app_clean.replace('"/api/chat"', '"http://localhost:8000/api/chat"')

    # Dynamically bridge environment detection to set liveMode if the local API is reachable
    app_clean = app_clean.replace(
        'state.liveMode = window.location.port === "8000";',
        '''
  state.liveMode = window.location.port === "8000";
  if (!state.liveMode) {
    // Check if the local uvicorn backend on port 8000 is running
    fetch("http://localhost:8000/")
      .then(() => {
        state.liveMode = true;
        const badge = document.querySelector('.azure-badge');
        if (badge) {
          badge.innerText = "API Active (Bridge)";
        }
        console.log("[GeoAI Platform] Connected to FastAPI backend on port 8000!");
      })
      .catch(() => {
        console.log("[GeoAI Platform] FastAPI backend offline, running in offline sandbox");
      });
  }
        '''
    )


    # 6. Concatenate JS into a single script block
    bundled_js = f"""
// ── UPLOADER MODULE ──────────────────────────────────────────────────────────
{uploader_clean}

// ── RENDERER MODULE ──────────────────────────────────────────────────────────
{renderer_clean}

// ── REPORTER MODULE ──────────────────────────────────────────────────────────
{reporter_clean}

// ── APP COORDINATOR ──────────────────────────────────────────────────────────
{app_clean}
"""

    # Replace the app.js script tag in index.html with the inline module bundle
    html_content = html_content.replace(
        '<script type="module" src="js/app.js"></script>',
        f'<script type="module">{bundled_js}</script>'
    )

    return html_content

try:
    bundled_html = get_bundled_html()
    st.components.v1.html(bundled_html, height=1000, scrolling=True)
except Exception as e:
    st.error(f"Error bundling UI: {e}")
