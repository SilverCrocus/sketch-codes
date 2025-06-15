import React, { useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import DrawingCanvas from '../components/DrawingCanvas';
import WinModal from '../components/WinModal';
import WordGrid from '../components/WordGrid';
import { generateClientId } from '../utils/clientId';
import { PREDEFINED_COLORS, BRUSH_SIZES } from '../constants/drawing';
import {
  StrokeData,
  NewStrokePayload,
  PlayerIdentifier,
  PlayerType,
  GameStatePayload,
  InitialGameDataPayload,
  StrokeTool,
  BackendStrokePayload,
  CardRevealStatus,
} from '../types/game';
import useGameWebSocket from '../hooks/useGameWebSocket';
import DrawingToolbar from '../components/DrawingToolbar';
import GameStatusDisplay from '../components/GameStatusDisplay';
import PlayerControls from '../components/PlayerControls';

const mapBackendStrokeToFrontendStroke = (backendStroke: BackendStrokePayload): StrokeData => {
  // StrokeData here refers to the one from types/game.ts
  return {
    id: backendStroke.id,
    points: backendStroke.points.flat(),
    color: backendStroke.color,
    brushSize: backendStroke.brushSize, // BackendStrokePayload has brushSize, map to frontend's brushSize
    tool: backendStroke.tool as StrokeTool,
    clientId: backendStroke.clientId ?? `remote-${Date.now()}`, // Ensure clientId is always present
  };
};

const GamePage: React.FC = () => {
  const { gameId = 'default-game' } = useParams<{ gameId?: string }>();
  const navigate = useNavigate();
  const [clientId] = useState<string>(() => generateClientId());

  // Game State
  const [strokes, setStrokes] = useState<StrokeData[]>([]);
  const [localStrokes, setLocalStrokes] = useState<StrokeData[]>([]);
  const [currentDrawingPlayerId, setCurrentDrawingPlayerId] = useState<string | null>(null);
  const [currentGuessingPlayerId, setCurrentGuessingPlayerId] = useState<string | null>(null);
  const [drawingPhaseActive, setDrawingPhaseActive] = useState<boolean>(false);
  const [drawingSubmitted, setDrawingSubmitted] = useState<boolean>(false);
  const [turnNumber, setTurnNumber] = useState<number>(0);
  const [guessingActive, setGuessingActive] = useState<boolean>(false);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [connectedClientIds, setConnectedClientIds] = useState<string[]>([]);
  const [gridWords, setGridWords] = useState<string[]>(Array(25).fill(''));
  const [keyCardA, setKeyCardA] = useState<string[]>(Array(25).fill(''));
  const [keyCardB, setKeyCardB] = useState<string[]>(Array(25).fill(''));
  const [gridRevealStatus, setGridRevealStatus] = useState<CardRevealStatus[]>(() =>
    Array(25)
      .fill(null)
      .map(() => ({ revealed_by_guesser_for_a: null, revealed_by_guesser_for_b: null }))
  );
  const [playerType, setPlayerType] = useState<'a' | 'b' | 'spectator'>('spectator');
  const [playerIdentities, setPlayerIdentities] = useState<Record<string, 'a' | 'b'>>({});
  const [opponentBoardClearedMessage, setOpponentBoardClearedMessage] = useState<string | null>(
    null
  );
  const [allAgentsFoundMessage, setAllAgentsFoundMessage] = useState<string | null>(null);
  const [currentClue, setCurrentClue] = useState<{ word: string; number: number } | null>(null);

  // Drawing Tool State
  const [currentTool, setCurrentTool] = useState<'pen' | 'eraser'>('pen');
  const [selectedColor, setSelectedColor] = useState<string>(PREDEFINED_COLORS[0].value);
  const [selectedBrushSize, setSelectedBrushSize] = useState<number>(BRUSH_SIZES[1].value);

  // WebSocket Callbacks
  const handleConnectionStatusChange = useCallback((status: boolean) => {
    console.log(`[GamePage] WebSocket connection status: ${status ? 'Connected' : 'Disconnected'}`);
  }, []);

  const handleGameStateUpdate = useCallback((data: GameStatePayload | InitialGameDataPayload) => {
    console.log('[GamePage] Received game state update:', data);

    if ('player_type' in data && data.player_type) {
      setPlayerType(data.player_type);
    }
    if (data.player_identities) {
      setPlayerIdentities((prev) => ({ ...prev, ...data.player_identities }));
    }
    // Ensure player_a_id and player_b_id from the root are also processed,
    // especially for InitialGameDataPayload or if they represent the canonical IDs.
    if ('player_a_id' in data && 'player_b_id' in data && data.player_a_id && data.player_b_id) {
      setPlayerIdentities((prev) => ({
        ...prev,
        [data.player_a_id]: 'a',
        [data.player_b_id]: 'b',
      }));
    }
    if (data.grid_words) setGridWords(data.grid_words);
    if (data.key_card_a) setKeyCardA(data.key_card_a);
    if (data.key_card_b) setKeyCardB(data.key_card_b);

    if (Array.isArray(data.strokes)) {
      setStrokes(data.strokes.map(mapBackendStrokeToFrontendStroke));
    }
    if (data.drawing_submitted) {
      setLocalStrokes([]);
    }
    setCurrentDrawingPlayerId(data.current_drawing_player_id ?? null);
    setCurrentGuessingPlayerId(data.current_guessing_player_id ?? null);
    setDrawingPhaseActive(data.drawing_phase_active ?? false);
    setDrawingSubmitted(data.drawing_submitted ?? false);
    setGuessingActive(data.guessing_active ?? false);
    setTurnNumber(data.turn_number ?? 0);
    setGameOver(data.game_over ?? false);
    setWinner(data.winner ?? null);
    setConnectedClientIds(data.connected_client_ids ?? []);
    if (data.grid_reveal_status) setGridRevealStatus(data.grid_reveal_status);
    if (data.player_cleared_opponent_board) {
      const clearer = data.player_cleared_opponent_board === 'A' ? 'Player A' : 'Player B';
      const opponent = data.player_cleared_opponent_board === 'A' ? 'Player B' : 'Player A';
      setOpponentBoardClearedMessage(`${clearer} has found all of ${opponent}'s agents!`);
    } else {
      setOpponentBoardClearedMessage(null);
    }
    setAllAgentsFoundMessage(data.all_agents_found_message ?? null);
    setCurrentClue(data.current_clue ?? null);
  }, []);

  const handleStrokeHistory = useCallback((history: BackendStrokePayload[]) => {
    console.log('[GamePage] Received stroke history:', history);
    setStrokes(history.map(mapBackendStrokeToFrontendStroke));
    setLocalStrokes([]);
  }, []);

  const handleNewStrokeCallback = useCallback(
    (newStroke: BackendStrokePayload) => {
      console.log('[GamePage] Received new stroke:', newStroke);
      if (newStroke.clientId !== clientId) {
        setStrokes((prevStrokes) => [...prevStrokes, mapBackendStrokeToFrontendStroke(newStroke)]);
      }
    },
    [clientId]
  );

  const handleClearCanvasMessageCallback = useCallback(() => {
    console.log('[GamePage] Received clear canvas message');
    setStrokes([]);
    setLocalStrokes([]);
  }, []);

  const {
    isConnected: webSocketIsConnected,
    sendStroke: sendStrokeToServer,
    sendClearCanvasRequest: sendClearCanvasRequestToServer,
    sendDrawingSubmission: sendDrawingSubmissionToServer,
    sendWordCardClick: sendWordCardClickToServer,
    sendEndGuessingTurn: sendEndGuessingTurnToServer,
    sendRestartGameRequest: sendRestartGameRequestToServer,
  } = useGameWebSocket({
    gameId,
    clientId,
    onConnectionStatusChange: handleConnectionStatusChange,
    onGameStateUpdate: handleGameStateUpdate, // This handles both initial and subsequent game states
    onStrokeHistory: handleStrokeHistory,
    onNewStroke: handleNewStrokeCallback, // Renamed to avoid conflict with hook's internal naming
    onClearCanvas: handleClearCanvasMessageCallback, // Renamed to avoid conflict
  });

  const myRole = useMemo(() => {
    if (currentDrawingPlayerId === clientId) return 'drawer';
    if (currentGuessingPlayerId === clientId) return 'guesser';
    return 'spectator';
  }, [clientId, currentDrawingPlayerId, currentGuessingPlayerId]);

  const perspectiveForGrid = useMemo(() => {
    if (myRole === 'guesser' || myRole === 'drawer') {
      return playerIdentities[clientId] || playerType;
    }
    return playerType;
  }, [myRole, playerType, playerIdentities, clientId]);

  const handleWordCardClick = useCallback(
    (index: number) => {
      if (myRole === 'guesser' && guessingActive && webSocketIsConnected) {
        console.log(`[GamePage] Word card clicked: ${index}`);
        sendWordCardClickToServer(index);
      }
    },
    [myRole, guessingActive, sendWordCardClickToServer, webSocketIsConnected]
  );

  const handleEndGuessing = useCallback(() => {
    if (myRole === 'guesser' && guessingActive && webSocketIsConnected) {
      console.log('[GamePage] Ending guessing turn');
      sendEndGuessingTurnToServer();
    }
  }, [myRole, guessingActive, sendEndGuessingTurnToServer, webSocketIsConnected]);

  const handleLocalStrokeEnd = useCallback(
    (strokeDataFromCanvas: {
      points: number[];
      color: string;
      width: number;
      tool: StrokeTool;
    }) => {
      // Explicitly type what DrawingCanvas's onDrawEnd provides
      if (!drawingPhaseActive || drawingSubmitted || !clientId) return;

      const completeStroke: StrokeData = {
        // Explicitly map fields, as strokeDataFromCanvas has 'width' and StrokeData expects 'brushSize'
        id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        points: strokeDataFromCanvas.points, // This is number[]
        color: strokeDataFromCanvas.color,
        brushSize: strokeDataFromCanvas.width, // Map 'width' from canvas to 'brushSize' for local StrokeData
        tool: strokeDataFromCanvas.tool,
        clientId: clientId,
      };

      setLocalStrokes((prevStrokes) => [...prevStrokes, completeStroke]);

      const pointsForBackend: number[][] = [];
      for (let i = 0; i < strokeDataFromCanvas.points.length; i += 2) {
        pointsForBackend.push([strokeDataFromCanvas.points[i], strokeDataFromCanvas.points[i + 1]]);
      }

      const newStrokePayloadBackend: NewStrokePayload = {
        points: pointsForBackend,
        color: strokeDataFromCanvas.color,
        width: strokeDataFromCanvas.width, // Use 'width' from canvas data, which NewStrokePayload expects
        tool: strokeDataFromCanvas.tool,
      };
      sendStrokeToServer(newStrokePayloadBackend);
    },
    [drawingPhaseActive, drawingSubmitted, clientId, sendStrokeToServer]
  );

  const handleSubmitDrawing = useCallback(() => {
    if (myRole === 'drawer' && drawingPhaseActive && !drawingSubmitted && webSocketIsConnected) {
      console.log('[GamePage] Submitting drawing');
      sendDrawingSubmissionToServer({
        client_id: clientId,
        clue: currentClue || { word: 'Default', number: 1 },
      });
      setDrawingSubmitted(true);
      // setLocalStrokes([]); // Clearing local strokes here might be premature if drawing continues briefly
    }
  }, [
    myRole,
    drawingPhaseActive,
    drawingSubmitted,
    sendDrawingSubmissionToServer,
    clientId,
    webSocketIsConnected,
    currentClue,
  ]);

  const handleClearCanvasAction = useCallback(() => {
    if (myRole === 'drawer' && drawingPhaseActive) {
      // Send clear canvas message via WebSocket
      sendClearCanvasRequestToServer();
      // Also clear local canvas immediately for responsiveness
      setStrokes([]); // Clear local stroke history
      setLocalStrokes([]);
    }
  }, [myRole, drawingPhaseActive, sendClearCanvasRequestToServer]);

  const handleRestartGame = () => {
    sendRestartGameRequestToServer();
    setGameOver(false);
    setWinner(null);
    // Potentially reset more game state here if needed
  };

  const handleExitGame = () => {
    navigate('/');
  };

  if (gameOver && winner) {
    return (
      <WinModal
        isOpen={gameOver && !!winner} // Added isOpen
        onClose={() => setGameOver(false)} // Added onClose
        winner={winner}
        playerType={playerType}
        onRestart={handleRestartGame}
        onExit={handleExitGame}
      />
    );
  }

  return (
    <>
      <div className="flex flex-col min-h-screen bg-gray-200 text-gray-800 font-sans">
        <header className="flex justify-between items-center p-3 bg-gray-300 shadow-lg sticky top-0 z-40">
          <DrawingToolbar
            currentTool={currentTool}
            onSetCurrentTool={setCurrentTool}
            selectedColor={selectedColor}
            onSetSelectedColor={setSelectedColor} // Renamed prop
            selectedBrushSize={selectedBrushSize}
            onSetSelectedBrushSize={setSelectedBrushSize} // Renamed prop
            isDrawingEnabled={
              webSocketIsConnected && myRole === 'drawer' && drawingPhaseActive && !drawingSubmitted
            }
            onClearCanvas={handleClearCanvasAction} // For the toolbar's own clear button
            drawingPhaseActive={drawingPhaseActive}
            drawingSubmitted={drawingSubmitted}
          />
          {!(
            myRole === 'drawer' &&
            drawingPhaseActive &&
            !drawingSubmitted &&
            webSocketIsConnected
          ) && <div className="flex-1 mx-2"></div>}
          <GameStatusDisplay
            turnNumber={turnNumber}
            drawingPhaseActive={drawingPhaseActive}
            guessingActive={guessingActive}
            drawingSubmitted={drawingSubmitted}
            myRole={myRole}
            currentClue={currentClue}
          />
        </header>

        <main className="flex flex-1 p-2 gap-2 overflow-hidden">
          <div className="flex-grow-[3] bg-white shadow-xl rounded-lg p-1 flex flex-col items-center justify-center relative overflow-hidden">
            {allAgentsFoundMessage && (
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-green-100 border border-green-500 text-green-700 px-3 py-1.5 rounded-md shadow-md z-10 text-xs font-semibold">
                {allAgentsFoundMessage}
              </div>
            )}
            {opponentBoardClearedMessage && (
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 bg-blue-100 border border-blue-500 text-blue-700 px-3 py-1.5 rounded-md shadow-md z-10 text-xs font-semibold">
                {opponentBoardClearedMessage}
              </div>
            )}
            <DrawingCanvas
              strokes={(myRole === 'drawer' ? [...strokes, ...localStrokes] : strokes).map((s) => ({
                id: s.id,
                points: s.points,
                color: s.color,
                width: s.brushSize, // Map to width for DrawingCanvas
                tool: s.tool,
                clientId: s.clientId,
              }))}
              onDrawEnd={handleLocalStrokeEnd}
              width={800}
              height={600}
              isDrawingEnabled={
                webSocketIsConnected &&
                myRole === 'drawer' &&
                drawingPhaseActive &&
                !drawingSubmitted
              }
              currentTool={currentTool}
              selectedColor={selectedColor}
              selectedBrushSize={selectedBrushSize}
              className="border border-gray-400 rounded-md shadow-inner bg-gray-50"
            />
          </div>

          <div className="flex-grow-[1] bg-gray-50 p-2 shadow-xl rounded-lg flex flex-col space-y-2 overflow-y-auto">
            <h2 className="text-base font-bold text-center text-gray-700 sticky top-0 bg-gray-50 py-1 z-10">
              Game Board
            </h2>
            <WordGrid
              gridWords={gridWords}
              gridRevealStatus={gridRevealStatus}
              onCardClick={handleWordCardClick}
              viewerPlayerType={playerType}
              activeClueGiverPerspective={perspectiveForGrid}
              isGuessingActive={guessingActive && myRole === 'guesser'}
              playerKeyCard={playerType === 'a' ? keyCardA : playerType === 'b' ? keyCardB : []}
            />
          </div>
        </main>

        <footer className="flex justify-between items-center p-2 bg-gray-300 shadow-lg border-t border-gray-400">
          <div className="text-xs min-w-[150px]">
            {!webSocketIsConnected && <p className="text-red-600 font-semibold">Connecting...</p>}
            {webSocketIsConnected && (
              <p className="text-green-700 font-semibold">
                Connected as {myRole} ({clientId.substring(0, 6)})
              </p>
            )}
            <p className="text-gray-600">Players: {connectedClientIds.length} online</p>
          </div>

          <PlayerControls
            myRole={myRole}
            drawingPhaseActive={drawingPhaseActive}
            drawingSubmitted={drawingSubmitted}
            guessingActive={guessingActive}
            gameOver={gameOver}
            webSocketIsConnected={webSocketIsConnected}
            onSubmitDrawing={handleSubmitDrawing}
            onEndGuessing={handleEndGuessing}
            onClearCanvas={handleClearCanvasAction} // Added missing prop
          />

          <div className="text-xs text-right min-w-[150px] text-gray-600">
            Game ID: <span className="font-mono">{gameId}</span>
          </div>
        </footer>
      </div>
    </>
  );
};

export default GamePage;
