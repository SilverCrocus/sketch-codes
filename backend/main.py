import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import random
from typing import List, Dict, Any, Optional
import uuid
from pydantic import BaseModel, ValidationError, ConfigDict, Field
import json
from fastapi import status
from starlette.websockets import WebSocketState

from words import WORD_LIST

app = FastAPI()

# --- CORS Middleware Configuration --- 
# This should be placed before any routes or WebSocket endpoints are defined.
origins = [
    "http://localhost",         # General localhost
    "http://localhost:3000",    # Common React dev port
    "http://localhost:5173",    # Common Vite dev port
    "http://localhost:61583",   # From console log, likely client ephemeral port but no harm in adding
    "http://127.0.0.1",       # General loopback
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:61583",
    # Add the specific origin your frontend is served from if different
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True, # Allow cookies and authorization headers
    allow_methods=["*"],    # Allow all HTTP methods
    allow_headers=["*"],    # Allow all headers
)

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
    id: str = Field(default_factory=lambda: f"stroke-{uuid.uuid4()}")
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
        game_id = f"{adj}{noun}{num}".lower() # Convert to lowercase
        if game_id not in active_games:
            return game_id
    # Fallback to UUID if too many collisions (highly unlikely with number suffix and decent list sizes)
    print("Warning: Max attempts reached for memorable game ID generation. Falling back to UUID.")
    return str(uuid.uuid4()).lower() # Convert to lowercase

# --- Connection Manager Helpers --- 
async def connect_client(game_id: str, client_id: str, websocket: WebSocket):
    if game_id not in game_room_connections:
        game_room_connections[game_id] = {}
    game_room_connections[game_id][client_id] = websocket
    print(f"Client {client_id} connected to game {game_id}")

async def disconnect_client(game_id: str, client_id: str):
    if game_id in game_room_connections and client_id in game_room_connections[game_id]:
        del game_room_connections[game_id][client_id]
        print(f"Client {client_id} disconnected from game {game_id}.")
        if not game_room_connections[game_id]: # if room is empty
            del game_room_connections[game_id]
            # print(f"Game room {game_id} is now empty.")
    # Game state client removal is handled in handle_disconnect within websocket_endpoint

async def broadcast_to_room(game_id: str, message_data: dict, sender_client_id: str | None):
    if game_id in active_games: # Check if game still active
        game = active_games[game_id]
        for client_id, websocket_conn in game.clients.items():
            if client_id != sender_client_id:  # Don't send back to original sender
                try:
                    if websocket_conn.client_state == WebSocketState.CONNECTED:
                        await websocket_conn.send_text(json.dumps(message_data))
                except Exception as e:
                    print(f"Error broadcasting to client {client_id} in game {game_id}: {e}")
    else:
        print(f"Skipping broadcast to non-existent game {game_id}")

async def broadcast_game_state(game_id: str):
    if game_id in active_games:
        game = active_games[game_id]
        
        base_game_state_payload = {
            "game_id": game.game_id,
            # strokes will be conditional
            "current_drawing_player_id": game.current_drawing_player_id,
            "current_guessing_player_id": game.current_guessing_player_id,
            "drawing_phase_active": game.drawing_phase_active,
            "drawing_submitted": game.drawing_submitted,
            "turn_number": game.turn_number,
            "connected_client_ids": list(game.clients.keys())
        }

        for client_id, websocket_conn in game.clients.items():
            client_specific_payload = base_game_state_payload.copy()
            
            # Conditional strokes:
            if client_id == game.current_drawing_player_id or game.drawing_submitted:
                client_specific_payload["strokes"] = [s.model_dump() for s in game.strokes]
            else: # Guessers/spectators before submission see no strokes
                client_specific_payload["strokes"] = [] 
            
            message_to_send = {
                "type": "GAME_STATE_UPDATE",
                "payload": client_specific_payload,
                "gameId": game_id 
            }
            try:
                if websocket_conn.client_state == WebSocketState.CONNECTED:
                    await websocket_conn.send_text(json.dumps(message_to_send))
            except Exception as e:
                print(f"Error broadcasting game state to client {client_id} in game {game_id}: {e}")
        
        print(f"Broadcasted game state for game {game_id}. Drawing submitted: {game.drawing_submitted}")
    else:
        print(f"Attempted to broadcast state for non-existent game: {game_id}")

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
        # Send existing strokes and game state to the newly connected client
        if established_game_id in active_games: 
            game_for_initial_state = active_games[established_game_id]
            
            # Determine strokes to send for INITIAL_STROKES event
            initial_strokes_for_client = []
            if established_client_id == game_for_initial_state.current_drawing_player_id or game_for_initial_state.drawing_submitted:
                initial_strokes_for_client = [stroke.model_dump() for stroke in game_for_initial_state.strokes]
            
            await websocket.send_text(json.dumps({
                "type": "INITIAL_STROKES", 
                "payload": initial_strokes_for_client, # Send potentially filtered strokes
                "gameId": established_game_id
            }))
            print(f"Sent {len(initial_strokes_for_client)} initial strokes to client {established_client_id} for game {established_game_id} (drawing_submitted: {game_for_initial_state.drawing_submitted})")
        else:
            print(f"Game {established_game_id} was removed before initial strokes could be sent to {established_client_id}.")

        # Assign roles and broadcast game state (broadcast_game_state will handle conditional strokes)
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
                # However, for simplicity and ensuring consistency with current_drawing_player logic, 
                # we'll broadcast the full state or a specific 'new_stroke' event.
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
            data_json = json.loads(data)
            message_data = data_json
            message_type = message_data.get("type")
            
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
                print(f"DEBUG: Received DRAW_STROKE. Full message_data: {message_data}")
                # stroke_payload is already a dict due to json.loads earlier
                stroke_payload_dict = message_data.get('payload') 
                game_id_for_stroke = message_data.get('gameId') # gameId from message payload
                client_id_for_stroke = message_data.get('clientId') # clientId from message payload

                if not isinstance(stroke_payload_dict, dict):
                    print(f"ERROR: Stroke payload is not a dictionary. Payload: {stroke_payload_dict}")
                    await websocket.send_json({"type": "ERROR", "payload": "Invalid stroke format"})
                    continue

                # Validate that the client sending the stroke is the current drawing player
                current_drawing_player_id_for_game = active_games[established_game_id].current_drawing_player_id
                if client_id_for_stroke != current_drawing_player_id_for_game:
                    print(f"ERROR: Client {client_id_for_stroke} is not the current drawing player ({current_drawing_player_id_for_game}) for game {established_game_id}. Ignoring stroke.")
                    # Optionally send an error message to the client
                    # await websocket.send_json({"type": "ERROR", "payload": "Not your turn to draw"})
                    continue
                
                # Validate that drawing_phase_active is True
                if not active_games[established_game_id].drawing_phase_active:
                    print(f"ERROR: Drawing phase is not active for game {established_game_id}. Ignoring stroke from {client_id_for_stroke}.")
                    # await websocket.send_json({"type": "ERROR", "payload": "Drawing phase is over"})
                    continue

                # Transform points from list of dicts [{x:v, y:v}] to list of lists [[v,v]] for Pydantic validation
                if 'points' in stroke_payload_dict and isinstance(stroke_payload_dict['points'], list):
                    transformed_points = []
                    all_points_valid = True
                    for point_obj in stroke_payload_dict['points']:
                        if isinstance(point_obj, dict) and 'x' in point_obj and 'y' in point_obj:
                            try:
                                transformed_points.append([float(point_obj['x']), float(point_obj['y'])])
                            except (TypeError, ValueError):
                                all_points_valid = False
                                print(f"ERROR: Non-numeric x/y in point object: {point_obj}")
                                break
                        elif isinstance(point_obj, list) and len(point_obj) == 2:
                            try:
                                transformed_points.append([float(point_obj[0]), float(point_obj[1])]) # If somehow already list of lists
                            except (TypeError, ValueError):
                                all_points_valid = False
                                print(f"ERROR: Non-numeric values in point list: {point_obj}")
                                break
                        else:
                            all_points_valid = False
                            print(f"ERROR: Malformed point in stroke_payload_dict: {point_obj}")
                            break
                    
                    if not all_points_valid:
                        await websocket.send_json({"type": "ERROR", "payload": "Invalid point data in stroke"})
                        continue # Skip this stroke
                    stroke_payload_dict['points'] = transformed_points
                else:
                    print(f"ERROR: 'points' field missing or invalid in stroke_payload_dict: {stroke_payload_dict.get('points')}")
                    await websocket.send_json({"type": "ERROR", "payload": "'points' field missing or invalid"})
                    continue # Skip this stroke

                # Add a unique ID to the stroke before validation and storage
                stroke_id = f"stroke-{uuid.uuid4()}"
                stroke_payload_dict_with_id = {**stroke_payload_dict, "id": stroke_id}
                print(f"DEBUG: Extracted stroke_payload_dict for Stroke validation: {stroke_payload_dict}")


                try:
                    validated_stroke = Stroke(**stroke_payload_dict_with_id)
                except ValidationError as e:
                    print(f"ERROR: Stroke validation failed for client {client_id_for_stroke} in game {game_id_for_stroke}. Error: {e.errors()}")
                    await websocket.send_json({"type": "ERROR", "payload": f"Invalid stroke data: {e.errors()}"})
                    continue

                if game_id_for_stroke not in active_games:
                    print(f"ERROR: DRAW_STROKE for non-existent game '{game_id_for_stroke}'. Stroke: {stroke_payload_dict}")
                    # This case should ideally be caught by the established_game_id check earlier
                    # but if payload_game_id could differ and bypass, this is a safeguard.
                    continue
                
                active_games[game_id_for_stroke].strokes.append(validated_stroke)
                print(f"Stroke from {client_id_for_stroke} successfully added to game {game_id_for_stroke}. Stroke ID: {stroke_id}")
                
                # DO NOT BROADCAST INDIVIDUAL STROKES TO ALL PLAYERS HERE
                # The drawing player sees their strokes locally.
                # Guessers will see strokes only after SUBMIT_DRAWING via GAME_STATE_UPDATE.
                # print(f"Stroke drawn by {established_client_id} and added to game {established_game_id}. Not broadcasting immediately.")

            elif message_type == "CLEAR_CANVAS":
                # Robustly get clientId for CLEAR_CANVAS
                msg_payload = message_data.get("payload", {})  # Default to empty dict if payload is missing
                client_id_for_clear = msg_payload.get("clientId")

                if not client_id_for_clear:
                    client_id_for_clear = established_client_id  # Fallback to client_id from connection path
                    print(f"DEBUG: CLEAR_CANVAS using clientId from connection path: {client_id_for_clear} for game {established_game_id}")
                else:
                    print(f"DEBUG: CLEAR_CANVAS using clientId from payload: {client_id_for_clear} for game {established_game_id}")

                if established_game_id in active_games:
                    current_game = active_games[established_game_id]
                    current_drawing_player_id_for_game = current_game.current_drawing_player_id

                    if client_id_for_clear == current_drawing_player_id_for_game:
                        if current_game.drawing_phase_active and not current_game.drawing_submitted:
                            current_game.strokes = []  # Clear the strokes
                            print(f"INFO: Canvas cleared for game {established_game_id} by client {client_id_for_clear}")
                            await broadcast_to_room(
                                established_game_id,
                                {"type": "CANVAS_CLEARED", "payload": {"clearedBy": client_id_for_clear, "gameId": established_game_id}},
                                sender_client_id=None 
                            )
                            # No need to call broadcast_game_state separately if CANVAS_CLEARED implies strokes are empty
                            # However, if other parts of game state could change, or if clients solely rely on GAME_STATE_UPDATE for strokes,
                            # then it might be needed. For now, CANVAS_CLEARED should be sufficient for strokes.
                            # Let's ensure clients handle CANVAS_CLEARED by emptying their local strokes.
                        else:
                            print(f"ERROR: Drawing phase not active or drawing already submitted for game {established_game_id}. Ignoring CLEAR_CANVAS from {client_id_for_clear}.")
                    else:
                        print(f"ERROR: Client '{client_id_for_clear}' is not the current drawing player ('{current_drawing_player_id_for_game}') for game {established_game_id}. Ignoring CLEAR_CANVAS.")
                else:
                    print(f"ERROR: CLEAR_CANVAS for non-existent game '{established_game_id}'.")

            elif message_type == "SUBMIT_DRAWING":
                print(f"Received SUBMIT_DRAWING from {established_client_id} in game {established_game_id}")
                if established_game_id in active_games:
                    game_state = active_games[established_game_id]
                    if game_state.current_drawing_player_id == established_client_id and game_state.drawing_phase_active:
                        game_state.drawing_submitted = True
                        game_state.drawing_phase_active = False # Drawing phase for this turn ends
                        print(f"Drawing submitted by {established_client_id} in game {established_game_id}. Drawing phase ended.")
                        # Notify all clients about the game state change
                        await broadcast_game_state(established_game_id)
                    else:
                        print(f"Unauthorized SUBMIT_DRAWING attempt by {established_client_id} or drawing not active in game {established_game_id}.")
                        # Optionally send an error message to the client
                else:
                    print(f"Game {established_game_id} not found for SUBMIT_DRAWING request from {established_client_id}.")

                # Add more message type handlers here as needed
                # e.g., for guesses, game start signals, etc.

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
            # if not active_games[game_id].clients: # If game is empty
            #     print(f"Game {game_id} is now empty. Removing from active_games.")
            #     del active_games[game_id]

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
