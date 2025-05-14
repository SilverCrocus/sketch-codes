import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import DrawingCanvas, { StrokeData } from '../components/DrawingCanvas'; 
import WordGrid from '../components/WordGrid'; 

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
  const [strokes, setStrokes] = useState<StrokeData[]>([]); 
  const [clientId, setClientId] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [reconnectAttempts, setReconnectAttempts] = useState<number>(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const [currentTool, setCurrentTool] = useState<'pen' | 'eraser'>('pen');

  const ws = useRef<WebSocket | null>(null);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const INITIAL_RECONNECT_DELAY_MS = 1000;

  useEffect(() => {
    const generatedClientId = `client-${Math.random().toString(36).substr(2, 9)}`;
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
        case 'ERROR':
          console.error('Error from server:', message.payload);
          break;
        default:
          console.log('Received unhandled message type:', message.type);
      }
    };

    ws.current.onclose = (event) => {
      console.log(`WebSocket disconnected for game ${gameId}. Clean disconnect: ${event.wasClean}, Code: ${event.code}, Reason: ${event.reason}`);
      setIsConnected(false);
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = INITIAL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts);
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
    </div>
  );
};

export default GamePage;
