import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import random
from typing import List, Dict, Any, Optional
import uuid
from pydantic import BaseModel, ValidationError, ConfigDict
import json
from fastapi import status
from starlette.websockets import WebSocketState

from words import WORD_LIST

app = FastAPI()

# --- Word lists for memorable game IDs ---
ADJECTIVES = [
    "Quick", "Lazy", "Sleepy", "Noisy", "Hungry", "Funny", "Silly", "Clever",
    "Brave", "Calm", "Eager", "Jolly", "Kind", "Proud", "Witty", "Zany"
]
NOUNS = [
    "Fox", "Dog", "Cat", "Bear", "Lion", "Tiger", "Puma", "Wolf", "Bird", "Duck",
    "Panda", "Koala", "Lemur", "Otter", "Squid", "Crab", "Shark", "Owl"
]

# --- Pydantic Models --- 
class Stroke(BaseModel):
    points: list[list[float]]
    color: str = "#000000"
    width: int = 2
    tool: str = "pen" # 'pen' or 'eraser'

class GameState(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    game_id: str
    clients: Dict[str, WebSocket] = {}
    strokes: List[Stroke] = []
    # Turn and game flow management
    current_drawing_player_id: Optional[str] = None
    current_guessing_player_id: Optional[str] = None
    drawing_phase_active: bool = True # Starts true, waiting for first drawer
    drawing_submitted: bool = False
    turn_number: int = 1 # Game starts with turn 1

class WebSocketMessagePayload(BaseModel):
    clientId: str | None = None
    # Add other potential payload fields here, or use a Union of specific payload types
    # For STROKE, the payload will be a Stroke model, handled separately.

class WebSocketMessage(BaseModel):
    type: str
    payload: Any # Stroke | WebSocketMessagePayload | dict | str - flexible for now
    gameId: str | None = None # gameId from client, esp. for JOIN

# --- In-memory storage --- 
active_games: Dict[str, GameState] = {}
# game_id -> client_id -> WebSocket connection
game_room_connections: Dict[str, Dict[str, WebSocket]] = {}

# --- Game ID Generation ---
def generate_memorable_game_id(max_attempts=10) -> str:
    for _ in range(max_attempts):
        adj = random.choice(ADJECTIVES)
        noun = random.choice(NOUNS)
        num = random.randint(1, 999) # Adding a number significantly reduces collisions
        game_id = f"{adj}{noun}{num}"
        if game_id not in active_games:
            return game_id
    # Fallback to UUID if too many collisions (highly unlikely with number suffix and decent list sizes)
    print("Warning: Max attempts reached for memorable game ID generation. Falling back to UUID.")
    return str(uuid.uuid4())

# --- Connection Manager Helpers --- 
async def connect_client(game_id: str, client_id: str, websocket: WebSocket):
    if game_id not in game_room_connections:
        game_room_connections[game_id] = {}
    game_room_connections[game_id][client_id] = websocket
    print(f"Client {client_id} connected to game {game_id}")

async def disconnect_client(game_id: str, client_id: str):
    if game_id in game_room_connections and client_id in game_room_connections[game_id]:
        del game_room_connections[game_id][client_id]
        if not game_room_connections[game_id]: # Remove game room if empty
            del game_room_connections[game_id]
        print(f"Client {client_id} disconnected from game {game_id}")
        # Optionally, notify others in the room
        # await broadcast_to_room(game_id, {"type": "PLAYER_LEFT", "payload": {"clientId": client_id}}, sender_client_id=None)

async def broadcast_to_room(game_id: str, message_data: dict, sender_client_id: str | None):
    if game_id in game_room_connections:
        message_json = json.dumps(message_data) # Serialize once
        for client_id, connection in game_room_connections[game_id].items():
            if client_id != sender_client_id:
                try:
                    await connection.send_text(message_json)
                except Exception as e:
                    print(f"Error broadcasting to client {client_id} in game {game_id}: {e}")
                    # Consider removing dead connections here

async def broadcast_game_state(game_id: str):
    if game_id not in active_games:
        print(f"broadcast_game_state: Game {game_id} not found.")
        return

    game_state = active_games[game_id]
    connected_client_ids = list(game_state.clients.keys()) # Get IDs from the actual WebSocket objects

    # Prepare a serializable version of the game state
    # Crucially, exclude the 'clients' field which contains non-serializable WebSocket objects
    serializable_game_data = game_state.model_dump(exclude={'clients'})

    message_payload = {
        "type": "GAME_STATE_UPDATE",
        "payload": {
            **serializable_game_data,
            "connected_client_ids": connected_client_ids # Add the list of client IDs
        }
    }

    print(f"Broadcasting GAME_STATE_UPDATE to {len(connected_client_ids)} clients in game {game_id}: {message_payload}")
    # Broadcasting to all, including the client that might have triggered the state change,
    # to ensure all clients have the definitive state.
    message_json = json.dumps(message_payload)
    for client_websocket in game_state.clients.values():
        try:
            await client_websocket.send_text(message_json)
        except WebSocketDisconnect:
            # This client disconnected before we could send the message.
            # The main cleanup logic in websocket_endpoint's finally block will handle it.
            print(f"Client disconnected during broadcast in game {game_id}. Will be cleaned up.")
        except Exception as e:
            print(f"Error broadcasting game state to a client in game {game_id}: {e}")
            # Potentially handle client disconnection here if send fails repeatedly

# Ensure the frontend build directory exists for static file serving
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
STATIC_ASSETS_DIR = os.path.join(FRONTEND_DIR, "assets")

# Mount static files (e.g., CSS, JS)
if os.path.exists(STATIC_ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=STATIC_ASSETS_DIR), name="static_assets")
else:
    print(f"Warning: Static assets directory not found at {STATIC_ASSETS_DIR}. Frontend might not load correctly until built.")

@app.websocket("/ws/{game_id_path}/{client_id_path}")
async def websocket_endpoint(websocket: WebSocket, game_id_path: str, client_id_path: str):
    established_game_id: str | None = None
    established_client_id: str | None = None

    # 1. Validate game_id_path and find the actual case-sensitive game_id
    actual_game_id_found = None
    for existing_game_id_key in active_games.keys():
        if existing_game_id_key.lower() == game_id_path.lower():
            actual_game_id_found = existing_game_id_key
            break

    if not actual_game_id_found:
        print(f"WebSocket connection attempt to non-existent or case-mismatched game: '{game_id_path}'. Closing.")
        # We can't send a message before accept, so we just close.
        # The client will see this as a failed connection.
        # For more specific error codes, FastAPI/Starlette might need specific handling
        # or we'd accept then immediately send error and close.
        # For now, direct close is simplest if game path is invalid.
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION) 
        return

    # 2. If game found, establish game_id and client_id for this connection
    established_game_id = actual_game_id_found
    established_client_id = client_id_path

    # 3. Accept the connection
    await websocket.accept()
    print(f"WebSocket connection accepted for game: {established_game_id}, client: {established_client_id}")

    # Ensure game still exists before proceeding (guard against rare race conditions)
    if established_game_id not in active_games:
        print(f"Game {established_game_id} was removed before client {established_client_id} could be fully added. Closing connection.")
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR) # Internal server error
        return

    # Add client to the game state
    # Ensure the clients dict is initialized for the game_id if it's a new game (should be by create_game)
    if not hasattr(active_games[established_game_id], 'clients') or active_games[established_game_id].clients is None:
        active_games[established_game_id].clients = {}
        print(f"Warning: Clients dictionary for game {established_game_id} was not initialized. Initialized now.")
        
    active_games[established_game_id].clients[established_client_id] = websocket

    try:
        # Send existing strokes to the newly connected client
        if established_game_id in active_games: # Re-check, game might have been deleted
            game_for_initial_strokes = active_games[established_game_id]
            initial_strokes_payload = [stroke.model_dump() for stroke in game_for_initial_strokes.strokes]
            await websocket.send_text(json.dumps({
                "type": "INITIAL_STROKES", 
                "payload": initial_strokes_payload,
                "gameId": established_game_id
            }))
            print(f"Sent {len(initial_strokes_payload)} initial strokes to client {established_client_id} for game {established_game_id}")
        else:
            print(f"Game {established_game_id} was removed before initial strokes could be sent to {established_client_id}.")

        # Assign roles and broadcast game state
        if established_game_id in active_games:
            current_game_state = active_games[established_game_id]
            player_role_changed = False
            if current_game_state.current_drawing_player_id is None:
                current_game_state.current_drawing_player_id = established_client_id
                print(f"Client {established_client_id} assigned as DRAWING player for game {established_game_id}.")
                player_role_changed = True
            elif current_game_state.current_guessing_player_id is None and established_client_id != current_game_state.current_drawing_player_id:
                current_game_state.current_guessing_player_id = established_client_id
                print(f"Client {established_client_id} assigned as GUESSING player for game {established_game_id}.")
                player_role_changed = True
            
            if player_role_changed:
                await broadcast_game_state(established_game_id)
            else:
                # If no roles changed (e.g., a third player joins, or a player reconnects),
                # still send them the current game state individually so they are up to speed.
                # The broadcast_game_state would also cover this, but this is more direct for the new client.
                # However, INITIAL_STROKES + a follow-up GAME_STATE_UPDATE (if roles changed) or just one full state message?
                # For now, new connections get INITIAL_STROKES. If their connection triggers a role change, all get GAME_STATE_UPDATE.
                # If no role change, this new client might not have the full game state beyond strokes.
                # Let's ensure new client always gets full state after initial strokes, even if no roles changed.
                # Simplest: always call broadcast_game_state after a client connects and initial strokes are sent.
                # The `if player_role_changed` was an optimization, but clarity and correctness are better here.
                # Let's send the full game state to this specific client if roles didn't change, or broadcast if they did.
                # Decision: Always broadcast after new client setup. This simplifies logic.
                # The previous thought about sending only to new client if no role change is more complex to maintain.
                await broadcast_game_state(established_game_id)

    except WebSocketDisconnect:
        print(f"Client {established_client_id} disconnected before or during initial strokes/state sending for game {established_game_id}.")
    except Exception as e_initial_send:
        print(f"Error sending initial strokes to client {established_client_id} in game {established_game_id}: {e_initial_send}")
        # Attempt to close gracefully if possible, then allow finally to clean up.
        try:
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
        except Exception:
            pass # Ignore errors on close if already disconnected
        # Allow finally block to handle cleanup by not re-raising or letting it flow
        pass # The connection is likely dead or problematic, proceed to finally

    try:
        while True:
            data = await websocket.receive_text()
            message_data = json.loads(data)
            # Basic validation, assuming WebSocketMessage structure from client
            # More robust validation can be added here if needed (e.g. using Pydantic)
            message_type = message_data.get("type")
            message_payload = message_data.get("payload")
            # gameId in message can be used for an additional check if desired, but path is primary
            # message_game_id = message_data.get("gameId") 

            if not established_game_id or not established_client_id: # Should not happen if logic above is correct
                print("Error: established_game_id or established_client_id not set in main loop.")
                await websocket.send_text(json.dumps({"type": "ERROR", "payload": "Server configuration error."}))
                break # Exit loop

            current_game_state = active_games.get(established_game_id)
            if not current_game_state:
                print(f"Error: Game {established_game_id} not found in active_games during message handling.")
                await websocket.send_text(json.dumps({"type": "ERROR", "payload": "Game not found."}))
                break # Exit loop

            if message_type == "DRAW_STROKE":
                try:
                    stroke_data = message_payload
                    stroke_data['clientId'] = established_client_id 
                    new_stroke = Stroke(**stroke_data)
                    current_game_state.strokes.append(new_stroke)
                    
                    broadcast_message_json = json.dumps({
                        "type": "STROKE_DRAWN",
                        "payload": new_stroke.model_dump(),
                        "gameId": established_game_id,
                        "senderClientId": established_client_id
                    })

                    client_ids_to_remove = []
                    for client_id, client_ws in list(current_game_state.clients.items()):
                        try:
                            await client_ws.send_text(broadcast_message_json)
                        except WebSocketDisconnect:
                            print(f"Client {client_id} in game {established_game_id} disconnected during broadcast. Marking for removal.")
                            client_ids_to_remove.append(client_id)
                        except Exception as e_broadcast:
                            print(f"Error sending STROKE_DRAWN to client {client_id} in game {established_game_id}: {e_broadcast}. Marking for removal.")
                            client_ids_to_remove.append(client_id)
                    
                    for client_id in client_ids_to_remove:
                        if client_id in current_game_state.clients:
                            del current_game_state.clients[client_id]
                            print(f"Removed disconnected client {client_id} from game {established_game_id} after broadcast failure.")
                            if not current_game_state.clients and established_game_id in active_games:
                                print(f"Game {established_game_id} is now empty after client removal. Removing from active_games.")
                                del active_games[established_game_id]

                    print(f"Client {established_client_id} in game {established_game_id} drew a stroke. Broadcast attempted to {len(current_game_state.clients)} remaining clients.")

                except ValidationError as e_val:
                    print(f"Validation Error processing DRAW_STROKE from {established_client_id} in {established_game_id}: {e_val}")
                    try:
                        await websocket.send_text(json.dumps({"type": "ERROR", "payload": f"Invalid stroke data: {e_val}"}))
                    except Exception as e_send_error:
                        print(f"Failed to send validation error to client {established_client_id}: {e_send_error}")
                except Exception as e_main_stroke:
                    print(f"Generic Error processing DRAW_STROKE from {established_client_id} in {established_game_id}: {e_main_stroke}")
                    # Avoid crashing the whole server part for this client, try to inform them
                    try:
                        await websocket.send_text(json.dumps({"type": "ERROR", "payload": "Error processing stroke on server."}))
                    except Exception as e_send_error:
                        print(f"Failed to send generic stroke processing error to client {established_client_id}: {e_send_error}")
            
            elif message_type == "CLEAR_CANVAS":
                current_game_state.strokes.clear()
                broadcast_clear_json = json.dumps({
                    "type": "CANVAS_CLEARED",
                    "gameId": established_game_id,
                    "senderClientId": established_client_id
                })
                client_ids_to_remove_clear = []
                for client_id, client_ws in list(current_game_state.clients.items()):
                    try:
                        await client_ws.send_text(broadcast_clear_json)
                    except WebSocketDisconnect:
                        print(f"Client {client_id} in game {established_game_id} disconnected during CLEAR_CANVAS broadcast. Marking for removal.")
                        client_ids_to_remove_clear.append(client_id)
                    except Exception as e_broadcast_clear:
                        print(f"Error sending CANVAS_CLEARED to client {client_id} in game {established_game_id}: {e_broadcast_clear}. Marking for removal.")
                        client_ids_to_remove_clear.append(client_id)

                for client_id in client_ids_to_remove_clear:
                    if client_id in current_game_state.clients:
                        del current_game_state.clients[client_id]
                        print(f"Removed disconnected client {client_id} from game {established_game_id} after CLEAR_CANVAS broadcast failure.")
                        if not current_game_state.clients and established_game_id in active_games:
                            print(f"Game {established_game_id} is now empty after client removal post-clear. Removing from active_games.")
                            del active_games[established_game_id]

                print(f"Canvas cleared for game {established_game_id} by client {established_client_id}. Broadcast attempted.")
            
            # ... handle other message types ...

    except WebSocketDisconnect:
        print(f"Client {established_client_id or 'Unknown'} disconnected from game {established_game_id or 'Unknown'}.")
    except Exception as e:
        print(f"Error in WebSocket loop for client {established_client_id or 'Unknown'} in game {established_game_id or 'Unknown'}: {e}")
        # Attempt to send an error message to the client if the socket is still openable
        try:
            await websocket.send_text(json.dumps({"type": "ERROR", "payload": "An unexpected server error occurred."}))
        except Exception as send_error:
            print(f"Could not send error to client after exception: {send_error}")
    finally:
        print(f"Cleaning up connection for client {established_client_id} in game {established_game_id}")
        await handle_disconnect(established_game_id, established_client_id, websocket)
        # Ensure the websocket is still in a connected state before trying to close explicitly
        # as it might have been closed by the client or an earlier exception.
        if websocket.client_state == WebSocketState.CONNECTED:
            try:
                await websocket.close()
                print(f"WebSocket connection closed for client {established_client_id} in game {established_game_id}")
            except RuntimeError as e:
                # This can happen if the connection is already closed by the client side abruptly
                print(f"RuntimeError when trying to close WebSocket for {established_client_id} in {established_game_id}: {e}. Connection likely already severed.")
        else:
            print(f"WebSocket for client {established_client_id} in game {established_game_id} already in state: {websocket.client_state}. No explicit close needed from finally block.")

async def handle_disconnect(game_id: str, client_id: str, websocket: WebSocket):
    if game_id and client_id and game_id in active_games:
        if client_id in active_games[game_id].clients:
            del active_games[game_id].clients[client_id]
            print(f"Removed client {client_id} from game {game_id}.")
            if not active_games[game_id].clients: # If game is empty
                print(f"Game {game_id} is now empty. Removing from active_games.")
                del active_games[game_id]

@app.get("/api/words", response_model=List[str])
async def get_random_words():
    if len(WORD_LIST) < 25:
        # Fallback or error if the word list is too small
        return random.sample(WORD_LIST, len(WORD_LIST))
    return random.sample(WORD_LIST, 25)

# --- Game Management API Endpoints --- 
@app.post("/api/create_game")
async def create_game():
    game_id_candidate = generate_memorable_game_id()
    # Ensure the generated ID is truly unique (highly likely, but good practice)
    while game_id_candidate in active_games:
        game_id_candidate = generate_memorable_game_id()
    
    game_id = game_id_candidate

    game_state = GameState(
        game_id=game_id,
        clients={},
        strokes=[],
        current_drawing_player_id=None, # To be set when the first player connects
        current_guessing_player_id=None, # To be set when the second player connects
        drawing_phase_active=True, # Game starts in a drawing phase (or waiting for drawer)
        drawing_submitted=False,
        turn_number=1
    )
    active_games[game_id] = game_state
    print(f"Game {game_id} created. Initial state: {game_state.model_dump()}")
    return {"game_id": game_id, "message": f"Game {game_id} created."}

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
    import uvicorn
    #reload=True causes issues with in-memory state like active_games
    #For development where state needs to persist across requests without external db/cache, set to False
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False) # MODIFIED
