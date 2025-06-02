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
# from words import WORD_LIST # Removed as WORD_LIST is defined comprehensively below

app = FastAPI()

@app.get("/ping")
async def ping():
    return {"message": "pong"}

# --- CORS Middleware Configuration ---
origins = [
    "http://localhost",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:61583",
    "http://127.0.0.1",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:61583",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# More extensive word list with common Codenames words
WORD_LIST = [
    "apple", "banana", "cherry", "date", "elderberry", "fig", "grape", "honeydew", "kiwi", "lemon",
    "mango", "nectarine", "orange", "papaya", "quince", "raspberry", "strawberry", "tangerine",
    "watermelon", "blueberry", "blackberry", "plum", "peach", "pear", "apricot", "avocado",
    "lime", "coconut", "guava", "dragonfruit", "book", "car", "dog", "elephant", "fire", "ghost",
    "house", "ice", "jungle", "king", "lion", "moon", "night", "ocean", "pirate", "queen",
    "robot", "star", "tree", "umbrella", "vampire", "witch", "xylophone", "yacht", "zebra",
    "airplane", "basketball", "computer", "dinosaur", "engine", "football", "guitar", "hospital",
    "igloo", "jacket", "kangaroo", "lighthouse", "mountain", "newspaper", "octopus", "penguin",
    "quarter", "rainbow", "satellite", "telescope", "unicorn", "volcano", "window", "xray", "yoga", "zipper"
]

try:
    with open("codenames_words.txt", "r") as f:
        additional_words = [line.strip() for line in f if line.strip()]
        WORD_LIST.extend(additional_words)
        print(f"Loaded {len(additional_words)} additional words from codenames_words.txt")
except FileNotFoundError:
    print("codenames_words.txt not found. Using the built-in word list.")

WORD_LIST = list(set(WORD_LIST))
print(f"Total word list size: {len(WORD_LIST)} words")

ADJECTIVES = [
    "Quick", "Lazy", "Sleepy", "Noisy", "Hungry", "Funny", "Silly", "Clever",
    "Brave", "Calm", "Eager", "Jolly", "Kind", "Proud", "Witty", "Zany"
]
NOUNS = [
    "Fox", "Dog", "Cat", "Bear", "Lion", "Tiger", "Puma", "Wolf", "Bird", "Duck",
    "Panda", "Koala", "Lemur", "Otter", "Squid", "Crab", "Shark", "Owl"
]

class Stroke(BaseModel):
    id: str = Field(default_factory=lambda: f"stroke-{uuid.uuid4()}")
    points: list[list[float]]
    color: str = "#000000"
    width: int = 2
    tool: str = "pen"

class CardRevealStatus(BaseModel):
    revealed_by_guesser_for_a: Optional[str] = None  # Stores type ('green', 'neutral', 'assassin') if Player A was cluer, Player B guessed
    revealed_by_guesser_for_b: Optional[str] = None  # Stores type if Player B was cluer, Player A guessed

class GameState(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    game_id: str
    clients: Dict[str, WebSocket] = Field(default_factory=dict)
    strokes: List[Stroke] = Field(default_factory=list)
    current_turn_drawing_strokes: List[Stroke] = Field(default_factory=list)
    grid_words: List[str] = Field(default_factory=list)
    key_card_a: List[str] = Field(default_factory=list)
    key_card_b: List[str] = Field(default_factory=list)
    player_a_id: Optional[str] = None
    player_b_id: Optional[str] = None
    # revealed_cards: List[str] = Field(default_factory=list) # Replaced by grid_reveal_status
    grid_reveal_status: List[CardRevealStatus] = Field(default_factory=lambda: [CardRevealStatus() for _ in range(25)])
    current_drawing_player_id: Optional[str] = None
    current_guessing_player_id: Optional[str] = None
    drawing_phase_active: bool = True
    drawing_submitted: bool = False
    guessing_active: bool = False
    correct_guesses_this_turn: int = 0
    turn_number: int = 1
    game_over: bool = False
    winner: Optional[str] = None

class WebSocketMessagePayload(BaseModel):
    clientId: Optional[str] = None

class WebSocketMessage(BaseModel):
    type: str
    payload: Any
    gameId: Optional[str] = None

active_games: Dict[str, GameState] = {}

def generate_memorable_game_id(max_attempts=10) -> str:
    for _ in range(max_attempts):
        adj = random.choice(ADJECTIVES)
        noun = random.choice(NOUNS)
        num = random.randint(1, 999)
        game_id = f"{adj}{noun}{num}".lower()
        if game_id not in active_games:
            return game_id
    print("Warning: Max attempts reached for memorable game ID generation. Falling back to UUID.")
    return str(uuid.uuid4()).lower()

async def broadcast_game_state(game_id: str):
    if game_id not in active_games:
        print(f"Error: Attempted to broadcast to non-existent game room {game_id}")
        return

    game_state = active_games[game_id]
    connected_client_ids = list(game_state.clients.keys())

    player_identities = {}
    if game_state.player_a_id:
        player_identities[game_state.player_a_id] = "a"
    if game_state.player_b_id:
        player_identities[game_state.player_b_id] = "b"

    base_payload = {
        "game_id": game_state.game_id,
        "strokes": [stroke.model_dump() for stroke in game_state.strokes],
        "grid_words": game_state.grid_words,
        "key_card_a": game_state.key_card_a,  # Always send key_card_a
        "key_card_b": game_state.key_card_b,  # Always send key_card_b
        "grid_reveal_status": [s.model_dump() for s in game_state.grid_reveal_status],
        "current_drawing_player_id": game_state.current_drawing_player_id,
        "current_guessing_player_id": game_state.current_guessing_player_id,
        "drawing_phase_active": game_state.drawing_phase_active,
        "drawing_submitted": game_state.drawing_submitted,
        "guessing_active": game_state.guessing_active,
        "correct_guesses_this_turn": game_state.correct_guesses_this_turn,
        "turn_number": game_state.turn_number,
        "game_over": game_state.game_over,
        "winner": game_state.winner,
        "player_identities": player_identities,
        "connected_client_ids": connected_client_ids,
        # Send current turn drawing strokes only if drawing isn't submitted yet
        "current_turn_drawing_strokes": [s.model_dump() for s in game_state.current_turn_drawing_strokes] if not game_state.drawing_submitted else []
    }

    # The client-specific key_card logic is removed.
    # key_card_a and key_card_b are now part of base_payload, sent to all clients.
    # The frontend will use its playerType to determine which keycard to display.
    for client_id, websocket in game_state.clients.items():
        message = {"type": "GAME_STATE", "payload": base_payload}
        try:
            if websocket.client_state == WebSocketState.CONNECTED:
                await websocket.send_text(json.dumps(message))
        except Exception as e:
            print(f"Error broadcasting game state to client {client_id} in game {game_id}: {e}")

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
STATIC_ASSETS_DIR = os.path.join(FRONTEND_DIR, "assets")

if os.path.exists(STATIC_ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=STATIC_ASSETS_DIR), name="static_assets")
else:
    print(f"Warning: Static assets directory not found at {STATIC_ASSETS_DIR}.")

@app.websocket("/ws/{game_id_path}/{client_id_path}")
async def websocket_endpoint(websocket: WebSocket, game_id_path: str, client_id_path: str):
    print(f"[Backend WebSocket] Received connection attempt for game: {game_id_path}, client: {client_id_path}")
    established_game_id: Optional[str] = None
    established_client_id: Optional[str] = None

    actual_game_id_found = None
    for existing_game_id_key in active_games.keys():
        if existing_game_id_key.lower() == game_id_path.lower():
            actual_game_id_found = existing_game_id_key
            break

    if not actual_game_id_found:
        print(f"Game ID '{game_id_path}' not found. Creating new game.")
        game_id = game_id_path
        active_games[game_id] = await _initialize_new_game_state(game_id) # Use helper for Codenames Duet initialization
        actual_game_id_found = game_id

    established_game_id = actual_game_id_found
    established_client_id = client_id_path

    # Accept the WebSocket connection before proceeding
    await websocket.accept()
    
    game_state = active_games[established_game_id]
    game_state.clients[established_client_id] = websocket

    try:
        # Determine player_type for the connecting client for INITIAL_GAME_DATA.
        # This predicts the role based on current assignments and availability.
        # The actual assignment happens after this message, and a GAME_STATE broadcast will confirm/update.
        player_type = "spectator" # Default to spectator
        if game_state.player_a_id is None: # First player connecting assumes role 'a'
            player_type = "a"
        elif game_state.player_a_id == established_client_id: # Player A reconnecting
            player_type = "a"
        elif game_state.player_b_id is None and game_state.player_a_id != established_client_id: # Second unique player connecting assumes role 'b'
            player_type = "b"
        elif game_state.player_b_id == established_client_id: # Player B reconnecting
            player_type = "b"
        # Otherwise, stays spectator if both roles are filled by others

        initial_payload_data = {
            "game_id": game_state.game_id,
            "strokes": [s.model_dump() for s in game_state.strokes],
            "grid_words": game_state.grid_words,
            "key_card_a": game_state.key_card_a,
            "key_card_b": game_state.key_card_b,
            "player_a_id": game_state.player_a_id,
            "player_b_id": game_state.player_b_id,
            "grid_reveal_status": [s.model_dump() for s in game_state.grid_reveal_status],
            "current_drawing_player_id": game_state.current_drawing_player_id,
            "current_guessing_player_id": game_state.current_guessing_player_id,
            "drawing_phase_active": game_state.drawing_phase_active,
            "drawing_submitted": game_state.drawing_submitted,
            "guessing_active": game_state.guessing_active,
            "correct_guesses_this_turn": game_state.correct_guesses_this_turn,
            "turn_number": game_state.turn_number,
            "game_over": game_state.game_over,
            "winner": game_state.winner,
            "connected_client_ids": list(game_state.clients.keys()),
            "current_turn_drawing_strokes": [],
            "player_type": player_type # Use the determined player_type
        }

        if not game_state.drawing_submitted and established_client_id == game_state.current_drawing_player_id:
            initial_payload_data["current_turn_drawing_strokes"] = [s.model_dump() for s in game_state.current_turn_drawing_strokes]

        await websocket.send_text(json.dumps({
            "type": "INITIAL_GAME_DATA",
            "payload": initial_payload_data,
            "gameId": established_game_id
        }))
        print(f"Sent INITIAL_GAME_DATA to client {established_client_id} for game {established_game_id} with player_type: {player_type}")

        # Now, officially assign player roles if needed and broadcast the potentially updated state
        player_assignment_changed = False
        if game_state.player_a_id is None:
            game_state.player_a_id = established_client_id
            # current_drawing_player_id is set when game is initialized, or on turn change.
            # For the very first player, they become the drawer.
            if game_state.current_drawing_player_id is None: 
                game_state.current_drawing_player_id = established_client_id
            print(f"Player A ({established_client_id}) registered. Current drawer: {game_state.current_drawing_player_id}.")
            player_assignment_changed = True
        elif game_state.player_b_id is None and game_state.player_a_id != established_client_id:
            game_state.player_b_id = established_client_id
            # current_guessing_player_id is set on turn change. For the second player, they become the guesser if no one is.
            if game_state.current_guessing_player_id is None: 
                 game_state.current_guessing_player_id = established_client_id
            print(f"Player B ({established_client_id}) registered. Current guesser: {game_state.current_guessing_player_id}.")
            player_assignment_changed = True
        elif game_state.player_a_id == established_client_id or game_state.player_b_id == established_client_id:
            print(f"Player {established_client_id} reconnected as Player {'A' if game_state.player_a_id == established_client_id else 'B'}.")
        else:
            print(f"INFO: Client {established_client_id} connected as an observer for game {established_game_id}.")

        # If player assignment changed, or even if it's a reconnect, broadcast the latest state
        # This ensures the new client gets the absolute latest, and others are updated if a new player joined.
        await broadcast_game_state(established_game_id)
        if player_assignment_changed:
            print(f"Game state after role assignment for {established_client_id}: {game_state.model_dump(exclude={'clients'})}")

        while True:
            message_text = "" # Initialize for use in error messages
            message_data = {} # Initialize for use in error messages
            try:
                message_text = await websocket.receive_text()
                message_data = json.loads(message_text)
                message_type = message_data.get("type")
                payload = message_data.get("payload", {})
                # payload_client_id = payload.get("clientId") # Not strictly needed if we use established_client_id

                game_state = active_games.get(established_game_id)
                if not game_state:
                    print(f"WARN: Game {established_game_id} disappeared during msg loop for {established_client_id}. Closing.")
                    if websocket.client_state == WebSocketState.CONNECTED:
                        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
                    break

                actor_client_id = established_client_id

                if message_type == "NEW_STROKE":
                    stroke_input_data = payload.get("stroke")
                    if not isinstance(stroke_input_data, dict):
                        print(f"ERROR: NEW_STROKE payload.stroke is not a dictionary from {actor_client_id}: {stroke_input_data}")
                        continue

                    if actor_client_id == game_state.current_drawing_player_id and \
                       game_state.drawing_phase_active and not game_state.drawing_submitted:
                        
                        processed_stroke_data = stroke_input_data.copy()

                        if 'points' in processed_stroke_data and isinstance(processed_stroke_data['points'], list):
                            raw_points = processed_stroke_data['points']
                            transformed_points = []
                            valid_points_format = True
                            for p_obj in raw_points:
                                if isinstance(p_obj, dict) and 'x' in p_obj and 'y' in p_obj:
                                    try: transformed_points.append([float(p_obj['x']), float(p_obj['y'])])
                                    except (TypeError, ValueError): valid_points_format = False; break
                                elif isinstance(p_obj, list) and len(p_obj) == 2:
                                    try: transformed_points.append([float(p_obj[0]), float(p_obj[1])])
                                    except (TypeError, ValueError): valid_points_format = False; break
                                else: valid_points_format = False; break
                            
                            if valid_points_format:
                                processed_stroke_data['points'] = transformed_points
                            else:
                                print(f"ERROR: Invalid point data in NEW_STROKE from {actor_client_id}. Points: {raw_points}")
                                continue
                        
                        try:
                            new_stroke = Stroke(**processed_stroke_data)
                            game_state.current_turn_drawing_strokes.append(new_stroke)
                            # To give drawing player immediate feedback of their own strokes (without full broadcast yet):
                            if websocket.client_state == WebSocketState.CONNECTED:
                                await websocket.send_text(json.dumps({
                                    "type": "CURRENT_STROKES_UPDATE", # Client listens for this to update its own canvas
                                    "payload": {"strokes": [s.model_dump() for s in game_state.current_turn_drawing_strokes]}
                                }))
                        except ValidationError as e:
                            print(f"ERROR: Stroke validation error for NEW_STROKE from {actor_client_id}: {e}. Processed data: {processed_stroke_data}")
                    else:
                        print(f"INFO: NEW_STROKE from {actor_client_id} ignored. Conditions not met.")

                elif message_type == "CLEAR_CANVAS":
                    if actor_client_id == game_state.current_drawing_player_id and \
                       game_state.drawing_phase_active and not game_state.drawing_submitted:
                        game_state.current_turn_drawing_strokes = []
                        print(f"INFO: Canvas cleared by drawer {actor_client_id} for game {established_game_id}.")
                        # Inform the drawer their canvas was cleared
                        if websocket.client_state == WebSocketState.CONNECTED:
                                await websocket.send_text(json.dumps({
                                    "type": "CURRENT_STROKES_UPDATE",
                                    "payload": {"strokes": []}
                                }))
                    else:
                        print(f"WARN: CLEAR_CANVAS from {actor_client_id} ignored. Conditions not met.")

                elif message_type == "SUBMIT_DRAWING":
                    if actor_client_id == game_state.current_drawing_player_id and \
                       game_state.drawing_phase_active and not game_state.drawing_submitted:
                        
                        submitted_strokes_payload = payload.get("strokes")
                        processed_payload_strokes = False

                        if isinstance(submitted_strokes_payload, list):
                            if len(submitted_strokes_payload) > 0:
                                print(f"INFO: Received {len(submitted_strokes_payload)} strokes in SUBMIT_DRAWING payload from {actor_client_id}.")
                                validated_submitted_strokes = []
                                for stroke_data in submitted_strokes_payload:
                                    if not isinstance(stroke_data, dict):
                                        print(f"ERROR: SUBMIT_DRAWING stroke_data is not a dictionary: {stroke_data} from {actor_client_id}")
                                        continue

                                    processed_stroke_data = stroke_data.copy()
                                    
                                    # Points transformation: frontend sends points as nested arrays e.g. [[x1,y1],[x2,y2]]
                                    if 'points' in processed_stroke_data and isinstance(processed_stroke_data['points'], list):
                                        raw_points = processed_stroke_data['points']
                                        transformed_points = []
                                        valid_points_format = True
                                        for p_pair in raw_points: # Each p_pair should be [x, y]
                                            if isinstance(p_pair, list) and len(p_pair) == 2:
                                                try:
                                                    transformed_points.append([float(p_pair[0]), float(p_pair[1])])
                                                except (TypeError, ValueError):
                                                    valid_points_format = False; break
                                            else: # Malformed point pair
                                                valid_points_format = False; break
                                        
                                        if valid_points_format:
                                            processed_stroke_data['points'] = transformed_points
                                        else:
                                            print(f"ERROR: Invalid point data format in SUBMIT_DRAWING from {actor_client_id}. Points: {raw_points}")
                                            continue # Skip this stroke
                                    else:
                                        print(f"ERROR: Missing or invalid 'points' list in SUBMIT_DRAWING stroke_data: {stroke_data} from {actor_client_id}")
                                        continue # Skip this stroke

                                    try:
                                        stroke_instance = Stroke(**processed_stroke_data)
                                        validated_submitted_strokes.append(stroke_instance)
                                    except ValidationError as e:
                                        print(f"ERROR: Stroke validation error for SUBMIT_DRAWING from {actor_client_id}: {e}. Data: {processed_stroke_data}")
                                        continue # Skip this stroke
                                
                                if validated_submitted_strokes: # If any strokes were successfully validated from non-empty payload
                                    game_state.current_turn_drawing_strokes = validated_submitted_strokes 
                                    print(f"INFO: Replaced current_turn_drawing_strokes with {len(validated_submitted_strokes)} validated strokes from SUBMIT_DRAWING payload.")
                                    processed_payload_strokes = True
                                else:
                                    print(f"WARN: No valid strokes processed from SUBMIT_DRAWING payload from {actor_client_id}. Retaining existing current_turn_drawing_strokes if any.")
                                    # Fallback: if payload had strokes but all failed validation, current_turn_drawing_strokes remains as is (from NEW_STROKEs)
                            else: # Empty list of strokes sent in payload
                                 print(f"INFO: SUBMIT_DRAWING payload contained an empty list of strokes from {actor_client_id}. Clearing current_turn_drawing_strokes.")
                                 game_state.current_turn_drawing_strokes = []
                                 processed_payload_strokes = True
                        else:
                            print(f"WARN: No 'strokes' list, or non-list 'strokes', found in SUBMIT_DRAWING payload from {actor_client_id}. Relying on prior NEW_STROKE data. Payload: {payload}")
                            # Fallback: if 'strokes' key is missing or not a list, current_turn_drawing_strokes remains as is.

                        # Now, finalize the drawing with the (potentially updated or cleared) current_turn_drawing_strokes
                        game_state.strokes.extend(game_state.current_turn_drawing_strokes)
                        
                        game_state.drawing_phase_active = False
                        game_state.drawing_submitted = True
                        game_state.guessing_active = True
                        print(f"INFO: Drawing submitted by {actor_client_id} for game {established_game_id}. Guessing now active.")
                    else:
                        print(f"WARN: SUBMIT_DRAWING from {actor_client_id} ignored. Conditions not met.")

                elif message_type == "GUESS_WORD":
                    word_index_str = payload.get("wordIndex")
                    if word_index_str is None:
                        print(f"ERROR: GUESS_WORD from {actor_client_id} missing 'wordIndex'.")
                        continue
                    try:
                        word_index = int(word_index_str)
                    except ValueError:
                        print(f"ERROR: GUESS_WORD 'wordIndex' ('{word_index_str}') not an int from {actor_client_id}.")
                        continue

                    if not (actor_client_id == game_state.current_guessing_player_id and game_state.guessing_active):
                        print(f"WARN: GUESS_WORD from {actor_client_id} ignored. Conditions not met.")
                        continue
                    if not (0 <= word_index < len(game_state.grid_words)):
                        print(f"ERROR: GUESS_WORD invalid word_index {word_index} from {actor_client_id}.")
                        continue
                    clue_giver_id = game_state.current_drawing_player_id
                    card_status_obj = game_state.grid_reveal_status[word_index]

                    guesser_is_player_a = (actor_client_id == game_state.player_a_id)
                    clue_giver_is_player_a = (clue_giver_id == game_state.player_a_id)

                    already_revealed_for_this_turn = False
                    if clue_giver_is_player_a:
                        if card_status_obj.revealed_by_guesser_for_a is not None:
                            already_revealed_for_this_turn = True
                    elif not clue_giver_is_player_a: # Clue giver is Player B
                        if card_status_obj.revealed_by_guesser_for_b is not None:
                            already_revealed_for_this_turn = True

                    if already_revealed_for_this_turn:
                        print(f"INFO: GUESS_WORD card at index {word_index} already processed for clue_giver {clue_giver_id} by guesser {actor_client_id}.")
                        continue

                    guesser_key_card = game_state.key_card_a if guesser_is_player_a else game_state.key_card_b
                    clue_giver_key_card = game_state.key_card_a if clue_giver_is_player_a else game_state.key_card_b

                    if not guesser_key_card or not clue_giver_key_card:
                        print(f"CRITICAL_ERROR: Key card missing for guesser {actor_client_id} or clue_giver {clue_giver_id}. Game: {established_game_id}")
                        continue

                    card_type_on_guesser_map = guesser_key_card[word_index]
                    card_type_on_clue_giver_map = clue_giver_key_card[word_index]

                    print(f"INFO: Game {established_game_id}: Guesser {actor_client_id} (Player {'A' if guesser_is_player_a else 'B'}) guesses word {word_index} ('{game_state.grid_words[word_index]}').")
                    print(f"INFO: Card is '{card_type_on_guesser_map}' on Guesser's map. Card is '{card_type_on_clue_giver_map}' on Clue Giver {clue_giver_id} (Player {'A' if clue_giver_is_player_a else 'B'})'s map.")

                    game_ended_this_guess = False
                    turn_ended_this_guess = False

                    # --- Assassin Logic ---
                    is_double_assassin = card_type_on_guesser_map == 'assassin' and card_type_on_clue_giver_map == 'assassin'
                    is_clue_giver_map_assassin = card_type_on_clue_giver_map == 'assassin'
                    is_guesser_map_assassin = card_type_on_guesser_map == 'assassin'

                    if is_double_assassin:
                        print(f"GAME_OVER: Double Assassin! Card {word_index} ('{game_state.grid_words[word_index]}'). Game {established_game_id}.")
                        game_state.game_over = True
                        game_state.winner = "Players Lose! (Double Assassin)"
                        card_status_obj.revealed_by_guesser_for_a = 'assassin' # Mark for both perspectives
                        card_status_obj.revealed_by_guesser_for_b = 'assassin'
                        game_ended_this_guess = True
                        # turn_ended_this_guess implicitly true if game_ended_this_guess is true

                    elif is_clue_giver_map_assassin: # Clue giver's map is assassin (and not a double, due to elif)
                        print(f"GAME_OVER: Guesser {actor_client_id} revealed Clue Giver {clue_giver_id}'s Assassin! Card {word_index} ('{game_state.grid_words[word_index]}'). Game {established_game_id}.")
                        game_state.game_over = True
                        game_state.winner = "Players Lose! (Assassin Revealed)" # User: "no one wins"
                        if clue_giver_is_player_a:
                            card_status_obj.revealed_by_guesser_for_a = 'assassin'
                        else:
                            card_status_obj.revealed_by_guesser_for_b = 'assassin'
                        game_ended_this_guess = True

                    elif is_guesser_map_assassin: # Guesser's map is assassin (not double, not clue giver's assassin that ends game)
                        # Turn Ends, Game Continues - Guesser Hit Own Assassin
                        print(f"INFO: Guesser {actor_client_id} hit their OWN Assassin! Card {word_index} ('{game_state.grid_words[word_index]}'). Turn ends. Game continues.")
                        # No game_over, no winner set here.
                        # No card_status_obj update for revealed_by_guesser_for_A/B, as this is for the clue giver's turn perspective.
                        # The guesser sees their own map; this card is not "revealed" for the clue giver's score/objective.
                        turn_ended_this_guess = True
                        # game_ended_this_guess remains False for this specific case.

                    # --- If Game Not Ended by Assassin, Process Regular Guess (Green/Neutral) ---
                    if not game_ended_this_guess:
                        # Only proceed if the turn wasn't already ended by the guesser hitting their own assassin
                        if not turn_ended_this_guess:
                            revealed_type_for_clue_giver_turn = card_type_on_clue_giver_map # This will be 'green' or 'neutral'
                            
                            if clue_giver_is_player_a:
                                card_status_obj.revealed_by_guesser_for_a = revealed_type_for_clue_giver_turn
                            else:
                                card_status_obj.revealed_by_guesser_for_b = revealed_type_for_clue_giver_turn
                            
                            print(f"INFO: Card {word_index} ('{game_state.grid_words[word_index]}') marked as '{revealed_type_for_clue_giver_turn}' for Clue Giver {clue_giver_id}'s turn.")

                            if revealed_type_for_clue_giver_turn == 'green':
                                game_state.correct_guesses_this_turn += 1
                                print(f"INFO: Correct guess for Clue Giver {clue_giver_id}. Turn continues. Correct guesses this turn: {game_state.correct_guesses_this_turn}.")
                            elif revealed_type_for_clue_giver_turn == 'neutral':
                                print(f"INFO: Incorrect guess (Neutral for Clue Giver {clue_giver_id}). Turn ends.")
                                turn_ended_this_guess = True
                            # Note: card_type_on_clue_giver_map cannot be 'assassin' here if game is to continue, 
                            # as that would have been caught by 'is_clue_giver_map_assassin' and set game_ended_this_guess = True.
                        
                        # Win condition check (e.g., 15 green cards) happens regardless of whether this specific guess ended the turn by being neutral
                        # or if the turn was ended by guesser's own assassin (as long as game didn't end from double/clue-giver assassin).
                        # (The win condition logic starting at line 535 in original code should follow here)
                        
                        # Check for Win Condition (only if game not ended by assassin)
                        all_target_green_indices_for_win = set()
                        for i, ct in enumerate(game_state.key_card_a):
                            if ct == 'green':
                                all_target_green_indices_for_win.add(i)
                        for i, ct in enumerate(game_state.key_card_b):
                            if ct == 'green':
                                all_target_green_indices_for_win.add(i)
                        
                        revealed_as_green_count = 0
                        for idx_win_check in all_target_green_indices_for_win:
                            status_check = game_state.grid_reveal_status[idx_win_check]
                            if status_check.revealed_by_guesser_for_a == 'green' or status_check.revealed_by_guesser_for_b == 'green':
                                revealed_as_green_count += 1
                        
                        print(f"INFO: Win condition: {revealed_as_green_count} / {len(all_target_green_indices_for_win)} unique green cards revealed (target 15).")
                        if revealed_as_green_count >= 15:
                            print(f"GAME_OVER: Players WIN! {revealed_as_green_count} green words identified. Game {established_game_id}.")
                            game_state.game_over = True
                            game_state.winner = "Players Win! (15 Green Words)"
                            game_ended_this_guess = True
                            turn_ended_this_guess = True

                    # --- Logic for GUESS_WORD causing a turn end or game end ---
                    if game_ended_this_guess:
                        print(f"INFO: Game {established_game_id} ended due to guess.")
                        # Game state (game_over, winner) already set. Broadcast will reflect this.
                    elif turn_ended_this_guess: # Game not ended, but turn ended
                        print(f"INFO: Turn {game_state.turn_number} ended for game {established_game_id} due to guess outcome. Guesses this turn: {game_state.correct_guesses_this_turn}")
                        
                        # Role switch and state reset for new turn
                        temp_drawer = game_state.current_drawing_player_id
                        game_state.current_drawing_player_id = game_state.current_guessing_player_id
                        game_state.current_guessing_player_id = temp_drawer
                        
                        game_state.drawing_phase_active = True
                        game_state.guessing_active = False
                        game_state.drawing_submitted = False
                        game_state.strokes.clear() # Clear all strokes from the board for the new turn
                        game_state.current_turn_drawing_strokes.clear() # Clear any strokes from the concluded turn
                        game_state.turn_number += 1
                        game_state.correct_guesses_this_turn = 0
                        print(f"INFO: New turn {game_state.turn_number} after GUESS_WORD. Drawer: {game_state.current_drawing_player_id}, Guesser: {game_state.current_guessing_player_id}. Canvas cleared. Display overrides cleared.")
                    # If neither game_ended_this_guess nor turn_ended_this_guess is true, it means a correct green guess was made
                    # and the turn continues. In this case, display_override should persist for the current turn.

                elif message_type == "END_GUESSING":
                    requesting_client_id_from_payload = payload.get("clientId")
                    print(f"INFO: Received END_GUESSING from {actor_client_id} (payload clientId: {requesting_client_id_from_payload}) for game {established_game_id}")

                    if not (actor_client_id == game_state.current_guessing_player_id and game_state.guessing_active and not game_state.game_over):
                        print(f"WARN: END_GUESSING from {actor_client_id} ignored. Conditions not met. Current guesser: {game_state.current_guessing_player_id}, Guessing active: {game_state.guessing_active}, Game over: {game_state.game_over}")
                    else:
                        print(f"INFO: Player {actor_client_id} ended guessing. Switching roles for game {established_game_id}.")
                        # Switch roles
                        previous_drawer = game_state.current_drawing_player_id
                        game_state.current_drawing_player_id = game_state.current_guessing_player_id # Guesser becomes drawer
                        game_state.current_guessing_player_id = previous_drawer # Drawer becomes guesser

                        # Reset game state for the new turn
                        game_state.drawing_phase_active = True
                        game_state.guessing_active = False
                        game_state.drawing_submitted = False
                        game_state.strokes.clear() # Clear all strokes from the board
                        game_state.current_turn_drawing_strokes.clear() # Clear any strokes from the current turn
                        game_state.turn_number += 1
                        game_state.correct_guesses_this_turn = 0
                        
                        print(f"INFO: New turn {game_state.turn_number} initiated by END_GUESSING. Drawer: {game_state.current_drawing_player_id}, Guesser: {game_state.current_guessing_player_id}. Canvas cleared. Display overrides cleared.")
                
                # After processing any message type that might change game state or roles:
                if established_game_id in active_games: # Ensure game still exists
                    game_state_state_for_broadcast = active_games.get(established_game_id)
                    if game_state_state_for_broadcast: # Check again, as it might be deleted in another async context
                         await broadcast_game_state(established_game_id)
                    else:
                        print(f"WARN: Game {established_game_id} became inactive before final broadcast in message loop for {actor_client_id}.")
                else:
                    print(f"WARN: Game {established_game_id} not in active_games for final broadcast for {actor_client_id}. Client might be closing.")
            except json.JSONDecodeError:
                print(f"ERROR: JSONDecodeError from {established_client_id}. Msg: '{message_text}'")
                continue
            except KeyError as e:
                print(f"ERROR: KeyError processing message from {established_client_id}. Error: {e}. Data: {message_data}")
                continue
            except WebSocketDisconnect:
                print(f"INFO: WebSocket disconnected for {established_client_id} (game {established_game_id}) during message processing.")
                break 
            except Exception as e:
                print(f"CRITICAL_ERROR: Unexpected error in message loop for {established_client_id} (game {established_game_id}): {e}")
                import traceback
                traceback.print_exc()
                if websocket.client_state == WebSocketState.CONNECTED:
                    try:
                        await websocket.send_text(json.dumps({"type": "ERROR", "payload": {"message": "A critical server error occurred."}}))
                    except Exception as send_err:
                        print(f"ERROR: Failed to send critical error msg to client: {send_err}")
                break # Exit message loop on unhandled errors to trigger cleanup

    except WebSocketDisconnect:
        print(f"INFO: Client {established_client_id or 'Unknown'} disconnected (game: {established_game_id or 'Unknown'}). Outer catch.")
    except Exception as e:
        print(f"CRITICAL_ERROR: Unhandled exception in WebSocket handler for {established_client_id} (game: {established_game_id}): {e}")
        import traceback
        traceback.print_exc()
        if websocket.client_state == WebSocketState.CONNECTED:
            try:
                await websocket.send_text(json.dumps({"type": "ERROR", "payload": {"message": "A critical server error occurred."}}))
                await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
            except Exception as close_err:
                print(f"ERROR: Failed to send error/close websocket after unhandled exception: {close_err}")
    finally:
        print(f"INFO: Cleaning up connection for client {established_client_id} in game {established_game_id}.")
        if established_game_id and established_client_id and established_game_id in active_games:
            game = active_games[established_game_id]
            if established_client_id in game.clients:
                del game.clients[established_client_id]
                print(f"Removed {established_client_id} from game.clients list.")
            
            cleanup_broadcast_needed = False
            if game.player_a_id == established_client_id:
                game.player_a_id = None
                print(f"Player A ({established_client_id}) slot cleared.")
                if game.current_drawing_player_id == established_client_id:
                    game.current_drawing_player_id = None
                if game.current_guessing_player_id == established_client_id:
                    game.current_guessing_player_id = None
                cleanup_broadcast_needed = True
            elif game.player_b_id == established_client_id:
                game.player_b_id = None
                print(f"Player B ({established_client_id}) slot cleared.")
                if game.current_drawing_player_id == established_client_id:
                    game.current_drawing_player_id = None
                if game.current_guessing_player_id == established_client_id:
                    game.current_guessing_player_id = None
                cleanup_broadcast_needed = True
            
            # If a player disconnects and roles become unassigned, try to reassign or handle game state
            if (game.player_a_id is None or game.player_b_id is None) and not game.game_over:
                # Logic to pause game or await new player could be added here
                print(f"INFO: Game {established_game_id} has an open player slot due to disconnect.")
                if game.current_drawing_player_id is None and game.player_a_id is not None:
                    game.current_drawing_player_id = game.player_a_id
                    print(f"INFO: Player A ({game.player_a_id}) becomes drawer by default.")
                elif game.current_drawing_player_id is None and game.player_b_id is not None:
                     game.current_drawing_player_id = game.player_b_id
                     print(f"INFO: Player B ({game.player_b_id}) becomes drawer by default.")

                if game.current_guessing_player_id is None and game.player_b_id is not None and game.player_b_id != game.current_drawing_player_id :
                    game.current_guessing_player_id = game.player_b_id
                    print(f"INFO: Player B ({game.player_b_id}) becomes guesser by default.")
                elif game.current_guessing_player_id is None and game.player_a_id is not None and game.player_a_id != game.current_drawing_player_id:
                     game.current_guessing_player_id = game.player_a_id
                     print(f"INFO: Player A ({game.player_a_id}) becomes guesser by default.")
                cleanup_broadcast_needed = True


            if not game.clients:
                print(f"Game {established_game_id} has no more clients. Removing game.")
                del active_games[established_game_id]
            elif cleanup_broadcast_needed:
                print(f"A player disconnected or roles potentially changed. Broadcasting updated game state for {established_game_id}.")
                await broadcast_game_state(established_game_id)
        
        if websocket.client_state == WebSocketState.CONNECTED:
            print(f"WebSocket for {established_client_id} still connected in finally. Closing now.")
            await websocket.close()
        print(f"Connection cleanup for {established_client_id} completed.")

@app.get("/api/words", response_model=List[str])
async def get_random_words_endpoint(): # Renamed to avoid conflict with function name
    if len(WORD_LIST) < 25:
        return random.sample(WORD_LIST, len(WORD_LIST))
    return random.sample(WORD_LIST, 25)

def generate_key_cards() -> tuple[List[str], List[str]]:
    key_a = ["neutral"] * 25
    key_b = ["neutral"] * 25
    
    available_indices = list(range(25))
    
    shared_green_positions = random.sample(available_indices, 3)
    for pos in shared_green_positions:
        key_a[pos] = "green"
        key_b[pos] = "green"
        available_indices.remove(pos)
        
    shared_assassin_position = random.choice(available_indices)
    key_a[shared_assassin_position] = "assassin"
    key_b[shared_assassin_position] = "assassin"
    available_indices.remove(shared_assassin_position)
    
    # Player A: 6 more green (total 9)
    a_unique_green_pos = random.sample(available_indices, 6)
    for pos in a_unique_green_pos:
        key_a[pos] = "green"
        available_indices.remove(pos)
        
    # Player B: 6 more green (total 9)
    b_unique_green_pos = random.sample(available_indices, 6)
    for pos in b_unique_green_pos:
        key_b[pos] = "green"
        available_indices.remove(pos)
        
    # Player A: 2 more assassins (total 3)
    # Indices available now are those not used for shared green, shared assassin, A's unique green, B's unique green
    a_unique_assassin_pos = random.sample(available_indices, 2)
    for pos in a_unique_assassin_pos:
        key_a[pos] = "assassin"
        available_indices.remove(pos) # Though not strictly needed for B as B picks from remaining
        
    # Player B: 2 more assassins (total 3)
    # available_indices now contains only positions for B's unique assassins and remaining neutrals
    b_unique_assassin_pos = random.sample(available_indices, 2)
    for pos in b_unique_assassin_pos:
        key_b[pos] = "assassin"
        # available_indices.remove(pos) # Not needed as this is the last sampling step

    # Sanity check counts (optional, for debugging)
    # print(f"Key A: Green={key_a.count('green')}, Assassin={key_a.count('assassin')}, Neutral={key_a.count('neutral')}")
    # print(f"Key B: Green={key_b.count('green')}, Assassin={key_b.count('assassin')}, Neutral={key_b.count('neutral')}")
    return key_a, key_b

async def _initialize_new_game_state(game_id: str) -> GameState:
    """Helper function to create and initialize a new GameState object."""
    words_for_game = await get_random_words_endpoint() # Use renamed endpoint function
    key_card_a, key_card_b = generate_key_cards()

    game_state = GameState(
        game_id=game_id,
        grid_words=words_for_game,
        key_card_a=key_card_a,
        key_card_b=key_card_b,
        # grid_reveal_status is default initialized in GameState model
        # player_identities is default initialized in GameState model
    )
    print(f"New GameState object initialized for game_id: {game_id}")
    return game_state

@app.post("/api/create_game")
async def create_game():
    """HTTP endpoint to create a new game."""
    game_id = generate_memorable_game_id()
    game_state = await _initialize_new_game_state(game_id) # Call helper
    active_games[game_id] = game_state # Store it
    print(f"Game {game_id} created via API. Initial state (excluding clients): {game_state.model_dump(exclude={'clients'})}")
    return {"game_id": game_id, "message": f"Game {game_id} created."}

@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    index_file_path = os.path.join(FRONTEND_DIR, "index.html")
    if not os.path.exists(FRONTEND_DIR): # Check parent dir first
        print(f"Warning: Frontend directory not found at {FRONTEND_DIR}. Ensure frontend is built.")
        return {"message": "Frontend directory not found. Build the frontend."}

    if not os.path.exists(index_file_path) and full_path != "favicon.ico":
        print(f"Warning: index.html not found at {index_file_path}.")
        return {"message": "index.html not found. Ensure the frontend is built."}
    
    potential_file_path = os.path.join(FRONTEND_DIR, full_path)
    if os.path.isfile(potential_file_path):
        return FileResponse(potential_file_path)
        
    return FileResponse(index_file_path)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=False)