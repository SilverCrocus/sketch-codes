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
  // clientId is typically handled by the backend via WebSocket connection context
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
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY_MS = 3000;

  // Determine current player's role
  const myRole = React.useMemo(() => {
    if (!clientId) return 'connecting'; 
    if (clientId === currentDrawingPlayerId) {
      return 'drawer';
    }
    if (clientId === currentGuessingPlayerId) {
      return 'guesser';
    }
    return 'spectator'; 
  }, [clientId, currentDrawingPlayerId, currentGuessingPlayerId]);

  const connect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    // clientId is now stable from useState initializer
    const lowerCaseGameId = gameId.toLowerCase();
    const wsUrl = `ws://localhost:8000/ws/${lowerCaseGameId}/${clientId}`;
    
    console.log(`Attempting to connect to WebSocket: ${wsUrl} (Attempt: ${reconnectAttempts + 1})`);
    if (ws.current && (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING)) {
        console.log("WebSocket is already open or connecting. Aborting new connection attempt.");
        return; // Avoid creating multiple connections
    }

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

        switch (message.type) {
          case 'INITIAL_STROKES':
            if (Array.isArray(message.payload)) {
              const initialStrokes = message.payload.map((pStroke: BackendStrokePayload) => 
                mapBackendStrokeToFrontendStroke(pStroke)
              );
              setStrokes(initialStrokes);
            }
            break;
          case 'STROKE_DRAWN':
            // Check if the stroke is from another client before adding
            if (message.payload && message.senderClientId !== clientId) { 
              const newStroke = mapBackendStrokeToFrontendStroke(message.payload as BackendStrokePayload);
              setStrokes(prevStrokes => [...prevStrokes, newStroke]);
            }
            break;
          case 'CANVAS_CLEARED': 
            // If the message indicates this client initiated the clear, it might already be optimistically cleared
            // Or, if any client (including this one after server ack) gets this, clear.
            // The backend should ensure `senderClientId` is reliable if used for exclusion.
            setStrokes([]); 
            console.log(`Canvas cleared based on ${message.senderClientId === clientId ? 'own' : 'remote'} request.`);
            break;
          case 'GAME_STATE_UPDATE':
            console.log("Received GAME_STATE_UPDATE:", message.payload);
            const { 
              strokes: backendStrokes, 
              current_drawing_player_id,
              current_guessing_player_id,
              drawing_phase_active,
              drawing_submitted,
              turn_number: newTurnNumber,
              connected_client_ids: updatedConnectedClientIds
            } = message.payload as GameStatePayload;
            
            if (backendStrokes) {
                setStrokes(backendStrokes.map(mapBackendStrokeToFrontendStroke));
            }
            setCurrentDrawingPlayerId(current_drawing_player_id);
            setCurrentGuessingPlayerId(current_guessing_player_id);
            setDrawingPhaseActive(drawing_phase_active);
            setDrawingSubmitted(drawing_submitted);
            setTurnNumber(newTurnNumber);
            setConnectedClientIds(updatedConnectedClientIds || []);
            break;
          case 'PLAYER_JOINED': // These might be folded into GAME_STATE_UPDATE
          case 'PLAYER_LEFT':   // Or handled if they carry specific data not in GAME_STATE_UPDATE
            if (message.payload && Array.isArray(message.payload.connected_client_ids)) {
              setConnectedClientIds(message.payload.connected_client_ids);
            } else if (message.payload && message.payload.clientId) {
                // Example: if PLAYER_LEFT just sends the clientId that left
                // setConnectedClientIds(prev => prev.filter(id => id !== message.payload.clientId));
            }
            break;
          case 'GAME_NOT_FOUND':
            console.error('Game not found:', message.payload?.message);
            alert(`Error: Game '${gameId}' not found. ${message.payload?.message || ''}`);
            navigate('/'); 
            break;
          case 'ERROR_MESSAGE':
            console.error('Error from server:', message.payload?.error);
            alert(`Server error: ${message.payload?.error || 'Unknown error'}`);
            break;
          default:
            console.warn('Received unhandled WebSocket message type:', message.type);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error, event.data);
      }
    };

    ws.current.onclose = (event) => {
      console.log(`WebSocket disconnected for client ${clientId}. Code: ${event.code}, Reason: ${event.reason}`);
      setIsConnected(false);
      // Only attempt to reconnect if the closure was unexpected and not a normal server close (1000) or navigating away (1005 is often browser leaving page)
      if (event.code !== 1000 && event.code !== 1005) { 
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
          console.log(`Attempting to reconnect in ${RECONNECT_DELAY_MS / 1000} seconds... (Attempt ${reconnectAttempts + 1})`);
          reconnectTimeoutRef.current = window.setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connect(); 
          }, RECONNECT_DELAY_MS);
        } else {
          console.error('Max reconnect attempts reached. Navigating away or showing persistent error.');
          alert('Could not connect to the game server after multiple attempts. Please try again later.');
          navigate('/'); 
        }
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error event:', error);
      // Consider if ws.current.close() should be called here to ensure onclose logic runs for reconnection
      // if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
      //   ws.current.close();
      // }
    };
  }, [gameId, clientId, navigate, reconnectAttempts]); // reconnectAttempts is needed to allow manual retries or iterated retries

  useEffect(() => {
    connect(); // Initial connection attempt

    return () => {
      if (ws.current) {
        console.log("Cleaning up WebSocket connection for client", clientId);
        ws.current.onopen = null;
        ws.current.onmessage = null;
        ws.current.onclose = null; // Important to nullify to prevent onclose logic from firing during cleanup
        ws.current.onerror = null;
        if (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING) {
            ws.current.close(1000, "Component unmounting"); // 1000 for normal closure
        }
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, clientId]); // Refined dependencies: connect itself depends on navigate, but effect runs on game/client change.

  const handleSendStroke = (points: number[][], color: string, width: number, tool: 'pen' | 'eraser') => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && clientId) { 
      const strokePayload: NewStrokePayload = {
        points,
        color,
        width,
        tool,
      };
      const message = {
        type: 'DRAW_STROKE',
        payload: strokePayload,
        gameId: gameId,       
        clientId: clientId    
      };
      ws.current.send(JSON.stringify(message));
    }
  };

  const handleLocalStrokeEnd = (newStrokeFromCanvas: Omit<StrokeData, 'id' | 'clientId'>) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && clientId) {
      const pointsNested: number[][] = [];
      for (let i = 0; i < newStrokeFromCanvas.points.length; i += 2) {
        if (i + 1 < newStrokeFromCanvas.points.length) { 
          pointsNested.push([newStrokeFromCanvas.points[i], newStrokeFromCanvas.points[i + 1]]);
        }
      }

      if (pointsNested.length > 0) { 
        handleSendStroke(
          pointsNested,
          newStrokeFromCanvas.color,
          newStrokeFromCanvas.width,
          newStrokeFromCanvas.tool
        );
      } else {
        console.warn("handleLocalStrokeEnd: No valid point pairs to send after processing newStrokeFromCanvas.points", newStrokeFromCanvas.points);
      }
    } else {
      console.error("Cannot send stroke: WebSocket not connected or client ID missing.");
    }
  };

  const handleClearCanvas = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN && clientId) { 
      ws.current.send(JSON.stringify({ type: 'CLEAR_CANVAS', gameId: gameId, payload: { clientId: clientId } }));
    }
  };

  const handleSubmitDrawing = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      console.log('Sending SUBMIT_DRAWING');
      ws.current.send(JSON.stringify({ type: 'SUBMIT_DRAWING', gameId: gameId, clientId: clientId })); 
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <h2>Game: {gameId}</h2>
      <p>Client ID: {clientId} | Status: {isConnected ? 'Connected' : (reconnectAttempts > 0 ? `Reconnecting (Attempt ${reconnectAttempts})...` : 'Disconnected')}</p>
      
      <div style={{ marginBottom: '10px' }}>
        <button onClick={() => setCurrentTool('pen')} disabled={currentTool === 'pen' || myRole !== 'drawer' || !drawingPhaseActive || drawingSubmitted}>Pen</button>
        <button onClick={() => setCurrentTool('eraser')} disabled={currentTool === 'eraser' || myRole !== 'drawer' || !drawingPhaseActive || drawingSubmitted}>Eraser</button>
        {myRole === 'drawer' && <span> Current Tool: {currentTool} </span>}
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
          isDrawingEnabled={isConnected && myRole === 'drawer' && drawingPhaseActive && !drawingSubmitted}
          currentTool={currentTool}
          strokeColor={'#000000'} 
          strokeWidth={5}       
        />
      </div>
      <button 
        onClick={handleClearCanvas} 
        style={{ marginTop: '10px' }} 
        disabled={myRole !== 'drawer' || !drawingPhaseActive || drawingSubmitted || !isConnected}>
        Clear Canvas
      </button>
      {myRole === 'drawer' && drawingPhaseActive && !drawingSubmitted && isConnected && (
        <button onClick={handleSubmitDrawing} style={{ marginTop: '10px' }}>Submit Drawing</button>
      )}
      <p>Your Role: {myRole}</p>
      <p>Turn: {turnNumber}</p>
      <p>Drawing Player: {currentDrawingPlayerId || 'N/A'}</p>
      <p>Guessing Player: {currentGuessingPlayerId || 'N/A'}</p>
      <p>Phase: {drawingPhaseActive ? 'Drawing' : 'Guessing/Other'}{drawingSubmitted ? ' (Drawing Submitted)' : ''}</p>
      <p>Connected Clients: {(Array.isArray(connectedClientIds) ? connectedClientIds : []).join(', ')}</p>
    </div>
  );
};

export default GamePage;
