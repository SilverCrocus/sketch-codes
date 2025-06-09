import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SketchPicker, ColorResult } from 'react-color';
import DrawingCanvas, { StrokeData } from '../components/DrawingCanvas';
import WinModal from '../components/WinModal';
import WordGrid from '../components/WordGrid';
import { generateClientId } from '../utils/clientId';

// Define colors and sizes (can be moved to a constants file later)
const PREDEFINED_COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Red', value: '#FF0000' },
  { name: 'Blue', value: '#0000FF' },
  { name: 'Green', value: '#008000' },
  { name: 'Yellow', value: '#FFFF00' },
  // Add more colors if desired
];

const BRUSH_SIZES = [
  { name: 'Small', value: 2 },
  { name: 'Medium', value: 5 },
  { name: 'Large', value: 10 },
  { name: 'X-Large', value: 20 },
];

const MIN_BRUSH_SIZE = 1;
const MAX_BRUSH_SIZE = 50; // Max brush/eraser size for the slider

interface BackendStrokePayload {
  id: string;
  points: number[][];
  color: string;
  width: number;
  tool: string;
  clientId?: string;
}

interface NewStrokePayload {
  points: number[][];
  color: string;
  width: number;
  tool: 'pen' | 'eraser';
}

interface WebSocketMessage {
  type: string;
  payload: any;
  gameId: string;
  senderClientId?: string;
}

interface CardRevealStatus {
  revealed_by_guesser_for_a: string | null;
  revealed_by_guesser_for_b: string | null;
}

interface GameStatePayload {
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
  // revealed_cards?: string[]; // Replaced by grid_reveal_status
  grid_reveal_status?: CardRevealStatus[];
  player_type?: 'a' | 'b' | 'spectator';
  guessing_active?: boolean;
  correct_guesses_this_turn?: number;
  game_over?: boolean;
  winner?: string | null;
  player_identities?: { [clientId: string]: 'a' | 'b' };
  player_cleared_opponent_board?: 'A' | 'B' | null; // Added for new feature
  all_agents_found_message?: string | null; // Message when a player finds all their agents
  current_clue?: { word: string; number: number } | null; // Current clue for the guessing player
}

const mapBackendStrokeToFrontendStroke = (backendStroke: BackendStrokePayload): StrokeData => {
  return {
    id: backendStroke.id,
    points: backendStroke.points.flat(),
    color: backendStroke.color,
    width: backendStroke.width,
    tool: backendStroke.tool as 'pen' | 'eraser',
    clientId: backendStroke.clientId,
  };
};

const GamePage: React.FC = () => {
  const { gameId = "default-game" } = useParams<{ gameId?: string }>();
  const navigate = useNavigate();
  const [clientId] = useState<string>(() => generateClientId());
  const [strokes, setStrokes] = useState<StrokeData[]>([]);
  const [localStrokes, setLocalStrokes] = useState<StrokeData[]>([]);
  const [currentTool, setCurrentTool] = useState<'pen' | 'eraser'>('pen');
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const [currentDrawingPlayerId, setCurrentDrawingPlayerId] = useState<string | null>(null);
  const [currentGuessingPlayerId, setCurrentGuessingPlayerId] = useState<string | null>(null);
  const [drawingPhaseActive, setDrawingPhaseActive] = useState<boolean>(true);
  const [drawingSubmitted, setDrawingSubmitted] = useState<boolean>(false);
  const [turnNumber, setTurnNumber] = useState<number>(0);
  const [guessingActive, setGuessingActive] = useState<boolean>(false);
  const [correctGuessesThisTurn, setCorrectGuessesThisTurn] = useState<number>(0);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [connectedClientIds, setConnectedClientIds] = useState<string[]>([]);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);

  const [gridWords, setGridWords] = useState<string[]>([]);
  const [keyCardA, setKeyCardA] = useState<string[]>(Array(25).fill('')); // Keycard for player A
  const [keyCardB, setKeyCardB] = useState<string[]>(Array(25).fill('')); // Keycard for player B
  const [gridRevealStatus, setGridRevealStatus] = useState<CardRevealStatus[]>(() => Array(25).fill(null).map(() => ({ revealed_by_guesser_for_a: null, revealed_by_guesser_for_b: null })));
  const [playerType, setPlayerType] = useState<'a' | 'b' | 'spectator'>('spectator');
  const [playerIdentities, setPlayerIdentities] = useState<Record<string, 'a' | 'b'>>({});
  const [opponentBoardClearedMessage, setOpponentBoardClearedMessage] = useState<string | null>(null);
  const [allAgentsFoundMessage, setAllAgentsFoundMessage] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string>(PREDEFINED_COLORS[0].value);
  const [selectedBrushSize, setSelectedBrushSize] = useState<number>(BRUSH_SIZES[1].value);
  const [displayColorPicker, setDisplayColorPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const [currentClue, setCurrentClue] = useState<{ word: string; number: number } | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 3000;

  // ... rest of the code ...

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setDisplayColorPicker(false);
      }
    };

    if (displayColorPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [displayColorPicker]);

  const handleWordCardClick = (index: number) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected. Cannot send word click.');
      return;
    }
    if (myRole === 'guesser' && guessingActive) {
      console.log(`Word at index ${index} clicked by guesser ${clientId}`);
      ws.current.send(JSON.stringify({
        type: 'GUESS_WORD',
        gameId: gameId,
        payload: {
          clientId: clientId,
          wordIndex: index
        }
      }));
    } else {
      console.log('Word click ignored. Not guesser or guessing not active.');
    }
  };

  const handleEndGuessing = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && clientId && myRole === 'guesser' && guessingActive) {
      console.log(`Guesser ${clientId} is ending their guessing turn.`);
      ws.current.send(JSON.stringify({
        type: 'END_GUESSING',
        gameId: gameId,
        clientId: clientId,
      }));
    } else {
      console.warn('Cannot end guessing: Conditions not met.');
    }
  };

  console.log('[GamePage Render] playerType:', playerType, 'keyCardA:', keyCardA.length > 0 ? keyCardA[0] : 'empty', 'keyCardB:', keyCardB.length > 0 ? keyCardB[0] : 'empty');
  console.log('[GamePage Render] allAgentsFoundMessage STATE IS:', allAgentsFoundMessage);

  const myRole = React.useMemo(() => {
    if (!clientId) return 'connecting';
    if (clientId === currentDrawingPlayerId) return 'drawer';
    if (clientId === currentGuessingPlayerId) return 'guesser';
    
    if (connectedClientIds.length > 0 && !currentDrawingPlayerId && !currentGuessingPlayerId) {
        if (connectedClientIds[0] === clientId && playerType !== 'b') return 'drawer'; 
        if (connectedClientIds.length > 1 && connectedClientIds[1] === clientId && playerType !== 'a') return 'guesser'; 
    }
    return 'spectator';
  }, [clientId, currentDrawingPlayerId, currentGuessingPlayerId, connectedClientIds, playerType]);

  const connect = useCallback(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    
    const lowerCaseGameId = gameId.toLowerCase();
    const wsUrl = `ws://localhost:8000/ws/${lowerCaseGameId}/${clientId}`;
    
    if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
        console.log("WebSocket is already open or connecting. Aborting new connection attempt.");
        return;
    }
    console.log(`[Connect] gameId: ${lowerCaseGameId}, clientId: ${clientId}`);
    console.log(`Attempting to connect to WebSocket: ${wsUrl} (Attempt: ${reconnectAttempts + 1})`);
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log(`WebSocket connected for client ${clientId} to game ${lowerCaseGameId}`);
      setIsConnected(true);
      setReconnectAttempts(0);
    };

    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as WebSocketMessage;
        console.log("RAW WebSocket message received:", message);

        console.log('[WebSocket OnMessage] Parsed message type:', message.type, 'Payload:', message.payload); // Diagnostic log

        switch (message.type) {
          case 'INITIAL_GAME_DATA':
            const initialPayload = message.payload as GameStatePayload;
            console.log('[WebSocket INITIAL_GAME_DATA] Processing. Received payload:', initialPayload);

            if (Array.isArray(initialPayload.strokes)) {
              setStrokes(initialPayload.strokes.map(mapBackendStrokeToFrontendStroke));
            }
            if (initialPayload.player_type) {
              setPlayerType(initialPayload.player_type);
              console.log(`[WebSocket INITIAL_GAME_DATA] Set playerType to: ${initialPayload.player_type} for client ${clientId}`);
            }
            if (Array.isArray(initialPayload.key_card_a)) {
              setKeyCardA(initialPayload.key_card_a);
              console.log('[WebSocket INITIAL_GAME_DATA] Set keyCardA:', initialPayload.key_card_a.length > 0 ? initialPayload.key_card_a[0] : 'empty_or_short');
            }
            if (Array.isArray(initialPayload.key_card_b)) {
              setKeyCardB(initialPayload.key_card_b);
              console.log('[WebSocket INITIAL_GAME_DATA] Set keyCardB:', initialPayload.key_card_b.length > 0 ? initialPayload.key_card_b[0] : 'empty_or_short');
            }
            setAllAgentsFoundMessage(initialPayload.all_agents_found_message || null);
            setCurrentClue(initialPayload.current_clue || null); // Set current clue
            break;
          case 'STROKE_DRAWN':
            if (message.payload && message.senderClientId !== clientId) {
              const newStroke = mapBackendStrokeToFrontendStroke(message.payload as BackendStrokePayload);
              setStrokes(prevStrokes => [...prevStrokes, newStroke]);
            }
            break;
          case 'CANVAS_CLEARED':
            setStrokes([]);
            setLocalStrokes([]); 
            console.log(`Canvas cleared based on ${message.senderClientId === clientId ? 'own' : 'remote'} request.`);
            break;
          case 'GAME_STATE':
            console.log('Received GAME_STATE payload:', JSON.stringify(message.payload, null, 2));
            const gameState = message.payload as GameStatePayload;

            if (Array.isArray(gameState.strokes)) {
              setStrokes(gameState.strokes.map(mapBackendStrokeToFrontendStroke));
            }

            if (gameState.drawing_submitted) {
                setLocalStrokes([]);
            }
            
            setCurrentDrawingPlayerId(gameState.current_drawing_player_id ?? null);
            setCurrentGuessingPlayerId(gameState.current_guessing_player_id ?? null);
            setDrawingPhaseActive(gameState.drawing_phase_active ?? false);
            setDrawingSubmitted(gameState.drawing_submitted ?? false);
            setGuessingActive(gameState.guessing_active ?? false);
            setCorrectGuessesThisTurn(gameState.correct_guesses_this_turn ?? 0);
            setTurnNumber(gameState.turn_number ?? 0);
            setGameOver(gameState.game_over || false);
            setWinner(gameState.winner || null);
            setConnectedClientIds(gameState.connected_client_ids || []);
            setCurrentClue(gameState.current_clue || null); // Set current clue

            if (Array.isArray(gameState.grid_words)) setGridWords(gameState.grid_words);
            if (Array.isArray(gameState.key_card_a)) {
              setKeyCardA(gameState.key_card_a);
              console.log('[WebSocket GAME_STATE] Set keyCardA:', gameState.key_card_a.length > 0 ? gameState.key_card_a[0] : 'empty_or_short');
            }
            if (Array.isArray(gameState.key_card_b)) {
              setKeyCardB(gameState.key_card_b);
              console.log('[WebSocket GAME_STATE] Set keyCardB:', gameState.key_card_b.length > 0 ? gameState.key_card_b[0] : 'empty_or_short');
            }
            if (gameState.grid_reveal_status) {
              console.log(
            "[GamePage OnMessage GAME_STATE] Received grid_reveal_status:", 
            JSON.stringify(gameState.grid_reveal_status, null, 2) // Stringify for clear logging
        );
              setGridRevealStatus(gameState.grid_reveal_status);
            }
            if (gameState.player_type) {
              setPlayerType(gameState.player_type);
              console.log(`[WebSocket GAME_STATE] Set playerType to: ${gameState.player_type} for client ${clientId}`);
            }
            if (gameState.player_identities) setPlayerIdentities(gameState.player_identities);

            // Handle opponent board cleared message
            if (gameState.player_cleared_opponent_board && gameState.player_cleared_opponent_board.toLowerCase() === playerType) {
              setOpponentBoardClearedMessage("You have guessed all their cards now its just your cards that remain");
            } else {
              setOpponentBoardClearedMessage(null); // Clear message if flag not present or not for this player
            }
            console.log("[WebSocket Handler] gameState.all_agents_found_message IS:", gameState.all_agents_found_message);
            setAllAgentsFoundMessage(gameState.all_agents_found_message || null);
            break;
          case 'GAME_NOT_FOUND':
            alert(`Error: Game '${gameId}' not found. ${message.payload?.message || ''}`);
            navigate('/');
            break;
          case 'ERROR_MESSAGE':
            alert(`Server error: ${message.payload?.error || 'Unknown error'}`);
            break;
          default:
            console.warn(`[WebSocket OnMessage] Received unknown message type: ${message.type}`, message);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error, event.data);
      }
    };

    ws.current.onclose = (event) => {
      console.error(`WebSocket disconnected. Code: ${event.code}, Reason: '${event.reason}', WasClean: ${event.wasClean}`);
      setIsConnected(false);

      // If it's a 1006 error (abnormal closure, often meaning server rejected handshake for non-existent game)
      // OR if max attempts are reached for other retryable codes.
      // Note: reconnectAttempts is 0-indexed for attempts made, so check against MAX_RECONNECT_ATTEMPTS - 1 for the next attempt.
      if (event.code === 1006 || reconnectAttempts >= MAX_RECONNECT_ATTEMPTS -1 ) {
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current); // Clear any pending timeout immediately

        if (event.code === 1006) {
            console.warn(`WebSocket connection to ${gameId} failed (Code 1006), game likely no longer exists. Navigating to home.`);
            alert('The game session has ended or the connection was refused. Returning to the home page.');
        } else {
            console.warn(`Max reconnect attempts reached for ${gameId}. Navigating to home.`);
            alert('Could not re-establish connection to the game server after multiple attempts. Returning to the home page.');
        }
        setReconnectAttempts(0); // Reset attempts for a future fresh navigation to game page
        navigate('/');
      } else if (event.code !== 1000 && event.code !== 1005) { // For other potentially recoverable errors
        console.log(`Reconnect attempt ${reconnectAttempts + 1} scheduled for ${gameId}. Code: ${event.code}`);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          connect();
        }, RECONNECT_DELAY_MS);
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }, [gameId, clientId, navigate]); 

  useEffect(() => {
    // Ensure we have gameId and clientId before attempting to connect
    if (gameId && clientId) {
      console.log(`[useEffect-Connect] gameId: ${gameId}, clientId: ${clientId}`);
      connect();
    }
    
    // Cleanup function
    return () => {
      if (ws.current) {
        console.log("Cleaning up WebSocket connection in useEffect unmount/re-run.");
        ws.current.onopen = null;
        ws.current.onmessage = null;
        ws.current.onerror = null;
        ws.current.onclose = null; // Explicitly nullify onclose to prevent old onclose from firing a reconnect
        if (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING) {
          ws.current.close(1000, "Component unmounting or re-running effect");
        }
        ws.current = null; // Ensure ws.current is null for the next run's check in connect()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current); // Clear any pending reconnect timeouts
      }
    };
  }, [connect, gameId, clientId]); 

  const handleSendStroke = (points: number[][], color: string, width: number, tool: 'pen' | 'eraser') => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && clientId) {
      const strokePayload: NewStrokePayload = { points, color, width, tool };
      ws.current.send(JSON.stringify({
        type: 'DRAW_STROKE',
        payload: strokePayload,
        gameId: gameId,
        senderClientId: clientId 
      }));
    }
  };

  const handleLocalStrokeEnd = (newStrokeFromCanvas: Omit<StrokeData, 'id' | 'clientId'>) => {
    if (myRole !== 'drawer' || !drawingPhaseActive || drawingSubmitted) return;
    if (ws.current && ws.current.readyState === WebSocket.OPEN && clientId) {
      const pointsNested: number[][] = [];
      for (let i = 0; i < newStrokeFromCanvas.points.length; i += 2) {
        if (i + 1 < newStrokeFromCanvas.points.length) {
          pointsNested.push([newStrokeFromCanvas.points[i], newStrokeFromCanvas.points[i + 1]]);
        }
      }
      if (pointsNested.length > 0) {
        const localStrokeId = `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const localStrokeToAdd: StrokeData = {
          id: localStrokeId,
          ...newStrokeFromCanvas,
          clientId: clientId
        };
        setLocalStrokes(prev => [...prev, localStrokeToAdd]);
        handleSendStroke(pointsNested, newStrokeFromCanvas.color, newStrokeFromCanvas.width, newStrokeFromCanvas.tool);
      } else {
        console.warn("handleLocalStrokeEnd: No valid point pairs.");
      }
    } else {
      console.error("Cannot send stroke: WebSocket not connected or client ID missing.");
    }
  };

  const handleSubmitDrawing = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && clientId && myRole === 'drawer' && !drawingSubmitted) {
      const strokesToSubmit = localStrokes.map(stroke => {
        const pointsNested: number[][] = [];
        for (let i = 0; i < stroke.points.length; i += 2) {
          if (i + 1 < stroke.points.length) {
            pointsNested.push([stroke.points[i], stroke.points[i + 1]]);
          }
        }
        return {
          id: stroke.id, 
          points: pointsNested,
          color: stroke.color,
          width: stroke.width,
          tool: stroke.tool,
          clientId: stroke.clientId
        } as BackendStrokePayload; 
      });

      console.log('Sending SUBMIT_DRAWING with local strokes:', strokesToSubmit);
      ws.current.send(JSON.stringify({
        type: 'SUBMIT_DRAWING',
        gameId: gameId,
        clientId: clientId, 
        payload: {
          strokes: strokesToSubmit 
        }
      }));
      setLocalStrokes([]); // Clear local strokes after submitting
    } else {
      console.error("Cannot submit drawing: Conditions not met.");
    }
  };

  const handleClearCanvas = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && clientId && myRole === 'drawer' && drawingPhaseActive && !drawingSubmitted) {
      setLocalStrokes([]); 
      ws.current.send(JSON.stringify({
        type: 'CLEAR_CANVAS',
        gameId: gameId,
        clientId: clientId 
      }));
      console.log('Sent CLEAR_CANVAS request.');
    } else {
      console.warn('Clear canvas action prevented.');
    }
  };

  // Debug logs for card clickability
  console.log('[GamePage Render] currentDrawingPlayerId:', currentDrawingPlayerId);
  console.log('[GamePage Render] playerIdentities:', JSON.stringify(playerIdentities));
  const perspectiveForGrid = (currentDrawingPlayerId && playerIdentities[currentDrawingPlayerId]) 
                             ? playerIdentities[currentDrawingPlayerId] 
                             : null;
  console.log('[GamePage Render] Calculated activeClueGiverPerspective for WordGrid:', perspectiveForGrid);
  console.log('[GamePage Render] guessingActive state:', guessingActive);
  console.log('[GamePage Render] myRole:', myRole);

  return (
    <>
      {/* Modals: WinModal and generic Game Over message */}
      {gameOver && (
        (winner === 'Players Win! (15 Green Words)') ? (
          <WinModal 
            isOpen={true} 
            onClose={() => {
              console.log('WinModal closed, navigate or rematch needed');
              setGameOver(false);
              setWinner(null);
            }} 
          />
        ) : (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <p className="text-red-500 font-bold text-3xl p-8 bg-gray-800 rounded-lg shadow-xl">
              Game Over! {winner ? `Winner: ${winner}` : "It's a draw!"}
            </p>
          </div>
        )
      )}
      {/* Consider adding ConnectionLostModal here if it's a separate component */}

      <div className="flex flex-col min-h-screen bg-gray-200 text-gray-800 font-sans">
        {/* Top Bar */}
        <header className="flex justify-between items-center p-3 bg-gray-300 shadow-lg sticky top-0 z-40">
          <h1 className="text-3xl font-bold text-blue-700">SketchCodes</h1>

          {/* Center: Drawing Tools (conditionally rendered) */}
          {myRole === 'drawer' && drawingPhaseActive && !drawingSubmitted && isConnected && (
            <div className="flex-1 flex flex-col items-center space-y-1 mx-2">
              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-1">
                  <span className="text-xs font-medium mr-1">Color:</span>
                  {PREDEFINED_COLORS.map(color => (
                    <button
                      key={color.value}
                      onClick={() => setSelectedColor(color.value)}
                      className={`w-[25px] h-[25px] rounded-full border-2 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 transition-all duration-150 ease-in-out
                                  ${selectedColor === color.value ? 'border-blue-700 ring-2 ring-blue-500' : 'border-gray-400 hover:border-gray-600'}`}
                      style={{ backgroundColor: color.value }}
                      title={color.name}
                      disabled={!drawingPhaseActive || drawingSubmitted}
                    />
                  ))}
                </div>
                <div className="relative">
                  <button
                    onClick={() => { if (isConnected && myRole === 'drawer' && drawingPhaseActive && !drawingSubmitted) setDisplayColorPicker(!displayColorPicker); }}
                    className="p-0.5 bg-white rounded shadow border border-gray-400 hover:border-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Select custom color"
                    disabled={!drawingPhaseActive || drawingSubmitted}
                  >
                    <div style={{ width: '20px', height: '14px', backgroundColor: selectedColor, borderRadius: '2px' }} />
                  </button>
                  {displayColorPicker && (
                    <div ref={colorPickerRef} className="absolute z-50 top-full mt-1 left-1/2 transform -translate-x-1/2 shadow-xl rounded">
                      <SketchPicker
                        color={selectedColor}
                        onChange={(color: ColorResult) => setSelectedColor(color.hex)}
                        disableAlpha
                        presetColors={PREDEFINED_COLORS.map(c => c.value)}
                        width="200px"
                        styles={{ default: { picker: { boxShadow: 'none', borderRadius: '4px', border: '1px solid #ccc' }}}}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-1">
                    <button 
                        onClick={() => setCurrentTool('pen')} 
                        disabled={currentTool === 'pen' || !drawingPhaseActive || drawingSubmitted}
                        className={`px-2 py-0.5 border rounded text-xs transition-colors duration-150
                                    ${currentTool === 'pen' ? 'bg-blue-600 text-white border-blue-700' : 'bg-white hover:bg-gray-100 border-gray-400'}`}
                    >Pen</button>
                    <button 
                        onClick={() => setCurrentTool('eraser')} 
                        disabled={currentTool === 'eraser' || !drawingPhaseActive || drawingSubmitted}
                        className={`px-2 py-0.5 border rounded text-xs transition-colors duration-150
                                    ${currentTool === 'eraser' ? 'bg-gray-600 text-white border-gray-700' : 'bg-white hover:bg-gray-100 border-gray-400'}`}
                    >Eraser</button>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium mr-1">Size:</span>
                <div className="flex items-center space-x-1">
                  {BRUSH_SIZES.map(size => (
                    <button
                      key={size.name}
                      onClick={() => setSelectedBrushSize(size.value)}
                      className={`px-1.5 py-0.5 border rounded text-xs transition-colors duration-150
                                  ${selectedBrushSize === size.value ? 'bg-blue-600 text-white border-blue-700' : 'bg-white hover:bg-gray-100 border-gray-400'}`}
                      disabled={!drawingPhaseActive || drawingSubmitted}
                    >
                      {size.name} ({size.value}px)
                    </button>
                  ))}
                </div>
                <div className="flex items-center space-x-1">
                  <input
                    type="range"
                    id="brushSizeSlider"
                    min={MIN_BRUSH_SIZE}
                    max={MAX_BRUSH_SIZE}
                    value={selectedBrushSize}
                    onChange={(e) => setSelectedBrushSize(parseInt(e.target.value, 10))}
                    disabled={!drawingPhaseActive || drawingSubmitted}
                    className="w-20 h-3 accent-blue-600 cursor-pointer disabled:opacity-50"
                    title={`Brush/Eraser Size: ${selectedBrushSize}px`}
                  />
                  <span className="text-xs w-8 text-right tabular-nums">{selectedBrushSize}px</span>
                </div>
              </div>
            </div>
          )}
          {!(myRole === 'drawer' && drawingPhaseActive && !drawingSubmitted && isConnected) && (
            <div className="flex-1 mx-2"></div> 
          )}

          <div className="text-xs space-y-0 text-right min-w-[140px]">
            <p><strong>Turn:</strong> <span className="font-mono">{turnNumber}</span></p>
            <p><strong>Phase:</strong> <span className="font-semibold">{drawingPhaseActive ? 'Drawing' : (guessingActive ? 'Guessing' : 'Waiting')}{drawingSubmitted ? ' (Submitted)' : ''}</span></p>
            <p><strong>Role:</strong> <span className="font-semibold">{myRole?.charAt(0).toUpperCase() + myRole?.slice(1)}</span></p>
          </div>
        </header>

        <main className="flex flex-1 p-2 gap-2 overflow-hidden">
          <div className="flex-grow-[3] bg-white shadow-xl rounded-lg p-1 flex flex-col items-center justify-center relative overflow-hidden">
            {allAgentsFoundMessage && (
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-green-100 border border-green-500 text-green-700 px-3 py-1.5 rounded-md shadow-md z-10 text-xs font-semibold">
                {allAgentsFoundMessage}
              </div>
            )}
            {opponentBoardClearedMessage && 
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-blue-100 border border-blue-500 text-blue-700 px-3 py-1.5 rounded-md shadow-md z-10 text-xs font-semibold">
                {opponentBoardClearedMessage}
              </div>
            }
            <DrawingCanvas
              strokes={myRole === 'drawer' ? [...strokes, ...localStrokes] : strokes}
              onDrawEnd={handleLocalStrokeEnd}
              width={800} 
              height={600}
              isDrawingEnabled={isConnected && myRole === 'drawer' && drawingPhaseActive && !drawingSubmitted}
              currentTool={currentTool}
              selectedColor={selectedColor}
              selectedBrushSize={selectedBrushSize}
              className="border border-gray-400 rounded-md shadow-inner bg-gray-50" 
            />
          </div>

          <div className="flex-grow-[1] bg-gray-50 p-2 shadow-xl rounded-lg flex flex-col space-y-2 overflow-y-auto">
            <h2 className="text-base font-bold text-center text-gray-700 sticky top-0 bg-gray-50 py-1 z-10">Game Board</h2>
            <WordGrid
              gridWords={gridWords}
              gridRevealStatus={gridRevealStatus}
              onCardClick={handleWordCardClick}
              myRole={myRole}
              activeClueGiverPerspective={perspectiveForGrid}
              isGuessingActive={guessingActive}
              playerKeyCard={(() => {
                const cardToPass = playerType === 'a' ? keyCardA : (playerType === 'b' ? keyCardB : []);
                return cardToPass;
              })()}
            />
            {currentClue && typeof currentClue.word === 'string' && typeof currentClue.number === 'number' && (
              <div className="mt-auto p-2 bg-yellow-100 border border-yellow-400 rounded-md shadow-md">
                <p className="text-xs font-semibold text-gray-700">Current Clue:</p>
                <p className="text-lg font-bold text-yellow-700 text-center">{currentClue.word} - {currentClue.number}</p>
              </div>
            )}
          </div>
        </main>

        <footer className="flex justify-between items-center p-2 bg-gray-300 shadow-lg border-t border-gray-400">
          <div className="text-xs min-w-[150px]">
            {!isConnected && <p className="text-red-600 font-semibold">Connecting... (Attempts: {reconnectAttempts})</p>}
            {isConnected && <p className="text-green-700 font-semibold">Connected as {myRole} ({clientId.substring(0,6)})</p>}
            <p className="text-gray-600">Players: {(Array.isArray(connectedClientIds) ? connectedClientIds.length : 0)} online</p>
          </div>

          <div className="flex space-x-2">
            {myRole === 'drawer' && drawingPhaseActive && !drawingSubmitted && isConnected && (
              <>
                <button 
                  onClick={handleClearCanvas} 
                  className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded shadow-md text-xs font-semibold transition-colors duration-150"
                >Clear Drawing</button>
                <button 
                  onClick={handleSubmitDrawing} 
                  className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded shadow-md text-xs font-semibold transition-colors duration-150"
                >Submit Drawing</button>
              </>
            )}
            {myRole === 'guesser' && guessingActive && !gameOver && isConnected && (
              <button 
                onClick={handleEndGuessing} 
                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded shadow-md text-xs font-semibold transition-colors duration-150"
              >End Guessing</button>
            )}
          </div>
          
          <div className="text-xs text-right min-w-[150px] text-gray-600">
             Game ID: <span className="font-mono">{gameId}</span>
          </div>
        </footer>
      </div>
    </>
  );
};

export default GamePage;
