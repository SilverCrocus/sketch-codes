import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DrawingCanvas, { StrokeData } from '../components/DrawingCanvas';
import WordGrid from '../components/WordGrid';
import { generateClientId } from '../utils/clientId';

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
  const reconnectTimeoutRef = useRef<number | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 3000;

  

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
              console.log("[WebSocket OnMessage] Received grid_reveal_status:", gameState.grid_reveal_status); // DEBUG LOG
              setGridRevealStatus(gameState.grid_reveal_status);
            }
            if (gameState.player_type) {
              setPlayerType(gameState.player_type);
              console.log(`[WebSocket GAME_STATE] Set playerType to: ${gameState.player_type} for client ${clientId}`);
            }
            if (gameState.player_identities) setPlayerIdentities(gameState.player_identities);
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
    <div>
      {!isConnected && <p>Connecting... Attempts: {reconnectAttempts}</p>}
      {isConnected && <p>Connected as: {clientId} (Role: {myRole})</p>}
      {gameOver && <p style={{ color: 'red', fontWeight: 'bold' }}>Game Over! {winner ? `Winner: ${winner}` : "It's a draw!"}</p>}

      <div style={{ marginBottom: '10px' }}>
        <button onClick={() => setCurrentTool('pen')} disabled={currentTool === 'pen' || myRole !== 'drawer' || !drawingPhaseActive || drawingSubmitted}>Pen</button>
        <button onClick={() => setCurrentTool('eraser')} disabled={currentTool === 'eraser' || myRole !== 'drawer' || !drawingPhaseActive || drawingSubmitted}>Eraser</button>
        {myRole === 'drawer' && <span> Tool: {currentTool} </span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px' }}>
        <WordGrid 
          gridWords={gridWords} // Corrected prop name
          // keyCard prop removed as it's not directly used by WordGrid for Duet
          gridRevealStatus={gridRevealStatus}
          onCardClick={handleWordCardClick} // Corrected prop name
          myRole={myRole}
          activeClueGiverPerspective={perspectiveForGrid}
          isGuessingActive={guessingActive} // Added prop
          playerKeyCard={(() => {
            const cardToPass = playerType === 'a' ? keyCardA : (playerType === 'b' ? keyCardB : []);
            console.log('[GamePage WordGrid Prop] playerType:', playerType, 'Calculated playerKeyCard for WordGrid:', cardToPass.length > 0 ? cardToPass[0] : 'empty_or_short', 'Full length:', cardToPass.length);
            return cardToPass;
          })()} // Pass current player's keycard
        /> 
        <DrawingCanvas 
          strokes={myRole === 'drawer' ? [...strokes, ...localStrokes] : strokes} 
          onDrawEnd={handleLocalStrokeEnd} 
          width={800} 
          height={600}
          isDrawingEnabled={isConnected && myRole === 'drawer' && drawingPhaseActive && !drawingSubmitted}
          currentTool={currentTool}
          strokeColor={'#000000'}
          strokeWidth={5}
        />
      </div>
      
      <div style={{ marginTop: '10px' }}>
        {myRole === 'drawer' && drawingPhaseActive && !drawingSubmitted && isConnected && (
          <>
            <button onClick={handleClearCanvas} style={{ marginRight: '10px' }}>Clear My Drawing</button>
            <button onClick={handleSubmitDrawing}>Submit Drawing</button>
          </>
        )}
        {myRole === 'guesser' && guessingActive && !gameOver && isConnected && (
          <button onClick={handleEndGuessing}>End Guessing & Start Drawing</button>
        )}
      </div>

      <div style={{ marginTop: '20px', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
        <h4>Game Info:</h4>
        <p>Turn: {turnNumber}</p>
        <p>Drawing Player: {currentDrawingPlayerId || 'N/A'}</p>
        <p>Guessing Player: {currentGuessingPlayerId || 'N/A'}</p>
        <p>Phase: {drawingPhaseActive ? 'Drawing' : (guessingActive ? 'Guessing' : 'Waiting')}{drawingSubmitted ? ' (Drawing Submitted)' : ''}</p>
        <p>Connected Clients: {(Array.isArray(connectedClientIds) ? connectedClientIds : []).join(', ')}</p>
      </div>
    </div>
  );
};

export default GamePage;
