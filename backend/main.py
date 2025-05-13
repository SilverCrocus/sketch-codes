import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import random
from typing import List

from words import WORD_LIST # Assuming words.py is in the same directory

app = FastAPI()

# Ensure the frontend build directory exists for static file serving
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
STATIC_ASSETS_DIR = os.path.join(FRONTEND_DIR, "assets")

# Mount static files (e.g., CSS, JS)
if os.path.exists(STATIC_ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=STATIC_ASSETS_DIR), name="static_assets")
else:
    print(f"Warning: Static assets directory not found at {STATIC_ASSETS_DIR}. Frontend might not load correctly until built.")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Message text was: {data}")
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error in websocket: {e}")
        await websocket.close(code=1011) # Internal Error

@app.get("/api/words", response_model=List[str])
async def get_random_words():
    if len(WORD_LIST) < 25:
        # Fallback or error if the word list is too small
        return random.sample(WORD_LIST, len(WORD_LIST))
    return random.sample(WORD_LIST, 25)

# Serve the index.html for the root path and any other path not caught by other routes
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    index_file_path = os.path.join(FRONTEND_DIR, "index.html")
    if not os.path.exists(index_file_path) and full_path != "favicon.ico": # Don't warn for favicon on first load
        print(f"Warning: index.html not found at {index_file_path}. Ensure the frontend is built and in the correct location.")
        return {"message": "Frontend not built yet. Run `npm run build` in the frontend directory."}
    
    # If the requested path seems like a file in the root of dist (e.g. favicon.ico, manifest.json)
    potential_file_path = os.path.join(FRONTEND_DIR, full_path)
    if os.path.isfile(potential_file_path):
        return FileResponse(potential_file_path)
        
    return FileResponse(index_file_path)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True) # Added reload for dev
