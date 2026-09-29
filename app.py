import os
import sys
from pathlib import Path

# Add project root and backend to sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.extend([str(BASE_DIR), str(BASE_DIR / "backend")])

try:
    import gradio as gr  # type: ignore
    has_gradio = True
except ImportError:
    gr = None
    has_gradio = False

from backend.main import app as fastapi_app

if has_gradio and gr is not None:
    # Gradio interface that acts as an entry point and provides an interactive API dashboard
    with gr.Blocks(title="AGATE API Gateway") as demo:
        gr.Markdown("# 🛢️ AGATE API Backend")
        gr.Markdown("FastAPI backend is live and serving endpoints for the AGATE application.")
        gr.Markdown("Interactive API Documentation: [Swagger UI (/docs)](/docs) | [ReDoc (/redoc)](/redoc)")

    # Mount FastAPI app so all /api endpoints, websockets, and routes work seamlessly
    app = gr.mount_gradio_app(fastapi_app, demo, path="/")
else:
    app = fastapi_app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 7860)))
