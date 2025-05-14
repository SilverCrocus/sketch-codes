import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DrawingCanvas, { StrokeData } from '../components/DrawingCanvas'; 
import WordGrid from '../components/WordGrid'; 
import { generateClientId } from '../utils/clientId';

interface BackendStrokePayload {
  points: number[][]; 
  color: string;
  width: number;
  tool: 'pen' | 'eraser';
  clientId?: string; 
}

interface WebSocketMessage {
  type: string;
  payload: any; 
  gameId: string;
  senderClientId?: string;
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
}

const backendStrokeToFrontendStroke = (bStroke: BackendStrokePayload, gameId: string): StrokeData => {
  return {
    id: `${bStroke.clientId || 'stroke'}-${gameId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    points: bStroke.points.flat(), 
    color: bStroke.color,
    width: bStroke.width,
    tool: bStroke.tool,
    clientId: bStroke.clientId,
  };
};

const GamePage: React.FC = () => {
  const { gameId = "default-game" } = useParams<{ gameId?: string }>();
  const navigate = useNavigate();
  const [clientId, setClientId] = useState<string>("");
  const [strokes, setStrokes] = useState<StrokeData[]>([]); 
  const [currentTool, setCurrentTool] = useState<'pen' | 'eraser'>('pen');
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // New state variables for game flow
  const [currentDrawingPlayerId, setCurrentDrawingPlayerId] = useState<string | null>(null);
  const [currentGuessingPlayerId, setCurrentGuessingPlayerId] = useState<string | null>(null);
  const [drawingPhaseActive, setDrawingPhaseActive] = useState<boolean>(true);
  const [drawingSubmitted, setDrawingSubmitted] = useState<boolean>(false);
  const [turnNumber, setTurnNumber] = useState<number>(0);
  const [connectedClientIds, setConnectedClientIds] = useState<string[]>([]);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Determine current player's role
  const myRole = React.useMemo(() => {
    if (clientId === currentDrawingPlayerId) {
      return 'drawer';
    }
    if (clientId === currentGuessingPlayerId) {
      return 'guesser';
    }
    return 'spectator'; // Or handle cases where client is not one of the two active players
  }, [clientId, currentDrawingPlayerId, currentGuessingPlayerId]);

  useEffect(() => {
    const generatedClientId = generateClientId();
    setClientId(generatedClientId);

    connectWebSocket(generatedClientId);

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [gameId]); 

  const connectWebSocket = (currentClientId: string) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        console.log("WebSocket is already connected.");
        return;
    }
    const wsUrl = `ws://localhost:8000/ws/${gameId}/${currentClientId}`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log(`WebSocket connected for client ${currentClientId} to game ${gameId}`);
      setIsConnected(true);
      setReconnectAttempts(0); 
      // Backend now handles JOIN_GAME via path params, no explicit JOIN_GAME message needed from client onopen
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data as string) as WebSocketMessage;
      console.log("Received message:", message);

      switch (message.type) {
        case 'INITIAL_STROKES':
          if (Array.isArray(message.payload)) {
            const initialStrokes = message.payload.map((pStroke: BackendStrokePayload) => 
              backendStrokeToFrontendStroke(pStroke, gameId)
            );
            setStrokes(initialStrokes);
          }
          break;
        case 'STROKE_DRAWN':
          if (message.payload && typeof message.payload === 'object' && !Array.isArray(message.payload)) {
            const newStroke = backendStrokeToFrontendStroke(message.payload as BackendStrokePayload, gameId);
            setStrokes((prevStrokes) => [...prevStrokes, newStroke]);
          } else {
            console.error("Received STROKE_DRAWN with unexpected payload:", message.payload);
          }
          break;
        case 'CANVAS_CLEARED':
          setStrokes([]);
          break;
        case 'GAME_STATE_UPDATE':
          console.log('Received GAME_STATE_UPDATE raw payload:', message.payload); 
          try {
            const gameState = message.payload as GameStatePayload;
            console.log('Parsed gameState for GAME_STATE_UPDATE:', gameState);

            if (typeof gameState.current_drawing_player_id !== 'string' && gameState.current_drawing_player_id !== null) {
              console.error('Invalid current_drawing_player_id type:', typeof gameState.current_drawing_player_id, 'value:', gameState.current_drawing_player_id);
            }
            setCurrentDrawingPlayerId(gameState.current_drawing_player_id);

            if (typeof gameState.current_guessing_player_id !== 'string' && gameState.current_guessing_player_id !== null) {
              console.error('Invalid current_guessing_player_id type:', typeof gameState.current_guessing_player_id, 'value:', gameState.current_guessing_player_id);
            }
            setCurrentGuessingPlayerId(gameState.current_guessing_player_id);

            if (typeof gameState.drawing_phase_active !== 'boolean') {
              console.error('Invalid drawing_phase_active type:', typeof gameState.drawing_phase_active, 'value:', gameState.drawing_phase_active);
            }
            setDrawingPhaseActive(gameState.drawing_phase_active);

            if (typeof gameState.drawing_submitted !== 'boolean') {
              console.error('Invalid drawing_submitted type:', typeof gameState.drawing_submitted, 'value:', gameState.drawing_submitted);
            }
            setDrawingSubmitted(gameState.drawing_submitted);

            if (typeof gameState.turn_number !== 'number') {
              console.error('Invalid turn_number type:', typeof gameState.turn_number, 'value:', gameState.turn_number);
            }
            setTurnNumber(gameState.turn_number);

            if (!Array.isArray(gameState.connected_client_ids)) {
              console.error('Invalid connected_client_ids: not an array. Value:', gameState.connected_client_ids);
              setConnectedClientIds([]); // Default to empty array if malformed
            } else if (gameState.connected_client_ids.some(id => typeof id !== 'string')) {
               console.error('Invalid connected_client_ids: contains non-string elements. Value:', gameState.connected_client_ids);
               setConnectedClientIds(gameState.connected_client_ids.filter(id => typeof id === 'string')); // Filter to keep only strings
            } else {
              setConnectedClientIds(gameState.connected_client_ids);
            }
            
            console.log('Successfully updated states for GAME_STATE_UPDATE.');

          } catch (error) {
            console.error('CRITICAL ERROR processing GAME_STATE_UPDATE:', error);
            console.error('Payload that caused error:', message.payload);
          }
          break;
        case 'ERROR':
          console.error('Received error message from server:', message.payload);
          break;
        default:
          console.log('Received unhandled message type:', message.type);
      }
    };

    ws.current.onclose = (event) => {
      console.log(`WebSocket disconnected for game ${gameId}. Clean disconnect: ${event.wasClean}, Code: ${event.code}, Reason: ${event.reason}`);
      setIsConnected(false);
      if (reconnectAttempts < 5) {
        const delay = 1000 * Math.pow(2, reconnectAttempts);
        console.log(`Attempting to reconnect in ${delay / 1000}s... (Attempt ${reconnectAttempts + 1})`);
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          setReconnectAttempts(prev => prev + 1);
          connectWebSocket(currentClientId); 
        }, delay);
      } else {
        console.error('Max reconnect attempts reached. Please check your connection or try refreshing.');
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  };

  const handleLocalStrokeEnd = (newStrokeData: Omit<StrokeData, 'id' | 'clientId'>) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      const pointsNested: number[][] = [];
      for (let i = 0; i < newStrokeData.points.length; i += 2) {
        pointsNested.push([newStrokeData.points[i], newStrokeData.points[i + 1]]);
      }

      const strokePayloadForBackend: BackendStrokePayload = {
        points: pointsNested,
        color: newStrokeData.color,
        width: newStrokeData.width,
        tool: newStrokeData.tool, 
        clientId: clientId
      };

      const message: Partial<WebSocketMessage> = {
        type: "DRAW_STROKE", 
        gameId: gameId,       
        payload: strokePayloadForBackend
      };
      ws.current.send(JSON.stringify(message));
    } else {
      console.error("Cannot send stroke: WebSocket not connected.");
    }
  };

  const handleClearCanvas = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      const message = { type: "CLEAR_CANVAS", gameId: gameId };
      ws.current.send(JSON.stringify(message));
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h2>Game: {gameId}</h2>
      <p>Client ID: {clientId} | Status: {isConnected ? 'Connected' : 'Disconnected (retrying...)'}</p>
      
      <div style={{ marginBottom: '10px' }}>
        <button onClick={() => setCurrentTool('pen')} disabled={currentTool === 'pen'}>Pen</button>
        <button onClick={() => setCurrentTool('eraser')} disabled={currentTool === 'eraser'}>Eraser</button>
        <span> Current Tool: {currentTool} </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div style={{ marginRight: '20px' }}>
          <WordGrid />
        </div>
        <DrawingCanvas 
          strokes={strokes} 
          onDrawEnd={handleLocalStrokeEnd} 
          width={800} 
          height={600}
          isDrawingEnabled={isConnected} 
          currentTool={currentTool}
        />
      </div>
      <button onClick={handleClearCanvas} style={{ marginTop: '10px' }}>Clear Canvas</button>
      <p>Your Role: {myRole}</p>
      <p>Turn: {turnNumber}</p>
      <p>Drawing Player: {currentDrawingPlayerId || 'N/A'}</p>
      <p>Guessing Player: {currentGuessingPlayerId || 'N/A'}</p>
      <p>Phase: {drawingPhaseActive ? 'Drawing' : 'Guessing/Other'}{drawingSubmitted ? ' (Drawing Submitted)' : ''}</p>
      <p>Connected Clients: {connectedClientIds.join(', ')}</p>
    </div>
  );
};

export default GamePage;
