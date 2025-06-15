export interface BackendStrokePayload {
  id: string;
  points: number[][];
  color: string;
  width: number;
  tool: string;
  brushSize: number; // Added brushSize
  clientId?: string;
}

export interface NewStrokePayload {
  points: number[][];
  color: string;
  width: number; // This is the stroke thickness for the backend
  tool: 'pen' | 'eraser';
}

export type StrokeTool = 'pen' | 'eraser';

export interface StrokeData {
  id: string; // Unique identifier for the stroke
  points: number[]; // Flat array [x1, y1, x2, y2, ...]
  color: string;
  brushSize: number; // Thickness for rendering, corresponds to 'width' from DrawingCanvas
  tool: StrokeTool;
  clientId: string; // Identifier for the client who drew the stroke
}

export interface Clue {
  word: string;
  number: number;
}

export type PlayerIdentifier = 'a' | 'b';
export type PlayerType = PlayerIdentifier | 'spectator';

export interface WebSocketMessage {
  type: string;
  payload: any;
  gameId: string;
  senderClientId?: string;
}

export interface CardRevealStatus {
  revealed_by_guesser_for_a: string | null;
  revealed_by_guesser_for_b: string | null;
}

export interface GameStatePayload {
  game_id: string;
  strokes: BackendStrokePayload[];
  current_drawing_player_id: string | null;
  current_guessing_player_id: string | null;
  drawing_phase_active: boolean;
  drawing_submitted: boolean;
  turn_number: number;
  connected_client_ids: string[];
  grid_words?: string[];
  key_card_a?: string[]; // For player A's perspective
  key_card_b?: string[]; // For player B's perspective
  grid_reveal_status?: CardRevealStatus[];
  player_type?: 'a' | 'b' | 'spectator';
  guessing_active?: boolean;
  correct_guesses_this_turn?: number;
  game_over?: boolean;
  winner?: string | null;
  player_identities?: { [clientId: string]: 'a' | 'b' };
  player_cleared_opponent_board?: 'A' | 'B' | null;
  all_agents_found_message?: string | null;
  current_clue?: { word: string; number: number } | null;
  // word: string; // This seems to be part of current_clue, check usage
  // number: number; // This seems to be part of current_clue, check usage
}

export interface InitialGameDataPayload
  extends Omit<GameStatePayload, 'player_a_id' | 'player_b_id'> {
  player_type: 'a' | 'b' | 'spectator'; // This is mandatory for initial data
  player_a_id: string; // Guaranteed in initial payload
  player_b_id: string; // Guaranteed in initial payload
  // Other fields from GameStatePayload are inherited (some optional, some not)
}
