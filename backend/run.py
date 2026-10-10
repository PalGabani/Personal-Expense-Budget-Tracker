"""Local development entry point for the FastAPI app.

On Windows, asyncio's default ProactorEventLoop can abort its accept loop
with ``OSError: [WinError 64] The specified network name is no longer
available``, which kills the dev server mid-session. The selector loop is
stable there, so select it before uvicorn builds the loop. On other
platforms this is a no-op.

Usage:

    python run.py            # reload enabled on 127.0.0.1:8000
"""

import asyncio
import sys

import uvicorn

HOST = "127.0.0.1"
PORT = 8000


def _use_stable_event_loop() -> None:
    if sys.platform == "win32" and hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


if __name__ == "__main__":
    _use_stable_event_loop()
    uvicorn.run("app.main:app", host=HOST, port=PORT, reload=True)