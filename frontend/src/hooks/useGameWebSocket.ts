import { useState, useEffect, useRef, useCallback } from 'react';
import {
  WebSocketMessage,
  GameStatePayload,
  BackendStrokePayload,
  NewStrokePayload,
  Clue,
} from '../types/game';

const WS_URL =
  process.env.NODE_ENV === 'production'
    ? `wss://${window.location.host}/ws`
    : 'ws://localhost:8000/ws';

interface UseGameWebSocketProps {
  gameId: string;
  clientId: string;
  onGameStateUpdate: (gameState: GameStatePayload) => void;
  onStrokeHistory: (strokes: BackendStrokePayload[]) => void;
  onNewStroke: (stroke: BackendStrokePayload) => void;
  onClearCanvas: () => void;
  onConnectionStatusChange?: (isConnected: boolean) => void;
  // Add other specific message handlers as needed
}

interface UseGameWebSocketReturn {
  sendStroke: (strokeData: NewStrokePayload) => void;
  sendClearCanvasRequest: () => void;
  sendDrawingSubmission: (payload: { client_id: string; clue: Clue }) => void; // Keep payload for now, backend might need it
  sendWordCardClick: (cardIndex: number) => void;
  sendEndGuessingTurn: () => void;
  sendRestartGameRequest: () => void;
  isConnected: boolean;
}

const useGameWebSocket = (props: UseGameWebSocketProps): UseGameWebSocketReturn => {
  const {
    gameId,
    clientId,
    onGameStateUpdate,
    onStrokeHistory,
    onNewStroke,
    onClearCanvas,
    onConnectionStatusChange,
  } = props;

  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const maxReconnectAttempts = 5;
  const reconnectInterval = 3000; // 3 seconds

  const connect = useCallback(() => {
    if (!gameId || !clientId) {
      console.log('Game ID or Client ID is missing, WebSocket connection aborted.');
      return;
    }

    console.log(`Attempting to connect to WebSocket for game: ${gameId}, client: ${clientId}`);
    ws.current = new WebSocket(`${WS_URL}/${gameId}/${clientId}`);

    ws.current.onopen = () => {
      console.log(`WebSocket connected for game: ${gameId}, client: ${clientId}`);
      setIsConnected(true);
      setReconnectAttempts(0);
      if (onConnectionStatusChange) onConnectionStatusChange(true);
      // Optionally send a join message or request initial state
      ws.current?.send(
        JSON.stringify({
          type: 'join_game',
          payload: { game_id: gameId },
          gameId,
          senderClientId: clientId,
        })
      );
    };

    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as WebSocketMessage;
        console.log('Received WebSocket message:', message);

        switch (message.type) {
          case 'game_state_update':
            onGameStateUpdate(message.payload as GameStatePayload);
            break;
          case 'stroke_history':
            onStrokeHistory(message.payload as BackendStrokePayload[]);
            break;
          case 'new_stroke':
            if (message.senderClientId !== clientId) {
              // Avoid re-drawing own strokes if server echoes them
              onNewStroke(message.payload as BackendStrokePayload);
            }
            break;
          case 'clear_canvas_broadcast':
            if (message.senderClientId !== clientId) {
              // Avoid re-clearing if server echoes
              onClearCanvas();
            }
            break;
          // Add more cases for other message types
          default:
            console.warn('Received unknown WebSocket message type:', message.type);
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };

    ws.current.onclose = (event) => {
      console.log(
        `WebSocket disconnected for game: ${gameId}. Code: ${event.code}, Reason: ${event.reason}`
      );
      setIsConnected(false);
      if (onConnectionStatusChange) onConnectionStatusChange(false);
      if (reconnectAttempts < maxReconnectAttempts) {
        console.log(
          `Attempting to reconnect in ${reconnectInterval / 1000} seconds... (Attempt ${reconnectAttempts + 1})`
        );
        setTimeout(() => {
          setReconnectAttempts((prev) => prev + 1);
          connect();
        }, reconnectInterval);
      } else {
        console.error('Max WebSocket reconnection attempts reached.');
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
      // onclose will be called next, triggering reconnection logic if applicable
    };
  }, [
    gameId,
    clientId,
    onGameStateUpdate,
    onStrokeHistory,
    onNewStroke,
    onClearCanvas,
    onConnectionStatusChange,
    reconnectAttempts,
  ]);

  useEffect(() => {
    connect();
    return () => {
      if (ws.current) {
        console.log('Closing WebSocket connection.');
        ws.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect]); // Rerun connect if gameId or clientId changes, handled by connect's dependency array

  const sendMessage = useCallback(
    (message: Omit<WebSocketMessage, 'gameId' | 'senderClientId'>) => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        const fullMessage: WebSocketMessage = {
          ...message,
          gameId,
          senderClientId: clientId,
        };
        ws.current.send(JSON.stringify(fullMessage));
      } else {
        console.error('WebSocket is not connected. Cannot send message:', message);
      }
    },
    [gameId, clientId]
  );

  // Specific sender functions
  const sendStroke = useCallback(
    (strokeData: NewStrokePayload) => {
      // Ensure tool type is correct before sending
      const validatedStrokeData: NewStrokePayload = {
        ...strokeData,
        tool: strokeData.tool === 'pen' || strokeData.tool === 'eraser' ? strokeData.tool : 'pen', // Default to pen if invalid
      };
      sendMessage({ type: 'new_stroke', payload: validatedStrokeData });
    },
    [sendMessage]
  );

  const sendClearCanvasRequest = useCallback(() => {
    sendMessage({ type: 'clear_canvas', payload: {} });
  }, [sendMessage]);

  const sendDrawingSubmission = useCallback(
    (payload: { client_id: string; clue: Clue }) => {
      sendMessage({ type: 'submit_drawing', payload });
    },
    [sendMessage]
  );

  const sendWordCardClick = useCallback(
    (cardIndex: number) => {
      sendMessage({ type: 'guess_card', payload: { card_index: cardIndex } });
    },
    [sendMessage]
  );

  const sendEndGuessingTurn = useCallback(() => {
    sendMessage({ type: 'end_turn', payload: {} });
  }, [sendMessage]);

  const sendRestartGameRequest = useCallback(() => {
    sendMessage({ type: 'restart_game', payload: {} });
  }, [sendMessage]);

  return {
    sendStroke,
    sendClearCanvasRequest,
    sendDrawingSubmission,
    sendWordCardClick,
    sendEndGuessingTurn,
    sendRestartGameRequest,
    isConnected,
  };
};

export default useGameWebSocket;
