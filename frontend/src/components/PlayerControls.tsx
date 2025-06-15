import React from 'react';

interface PlayerControlsProps {
  myRole: 'drawer' | 'guesser' | 'spectator' | 'connecting' | null;
  drawingPhaseActive: boolean;
  drawingSubmitted: boolean;
  guessingActive: boolean;
  gameOver: boolean;
  webSocketIsConnected: boolean;
  onClearCanvas: () => void;
  onSubmitDrawing: () => void;
  onEndGuessing: () => void;
}

const PlayerControls: React.FC<PlayerControlsProps> = ({
  myRole,
  drawingPhaseActive,
  drawingSubmitted,
  guessingActive,
  gameOver,
  webSocketIsConnected,
  onClearCanvas,
  onSubmitDrawing,
  onEndGuessing,
}) => {
  if (!webSocketIsConnected) {
    return null; // Or some placeholder if connection is lost but controls were visible
  }

  return (
    <div className="flex space-x-2">
      {myRole === 'drawer' && drawingPhaseActive && !drawingSubmitted && (
        <>
          <button
            onClick={onClearCanvas}
            className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded shadow-md text-xs font-semibold transition-colors duration-150"
          >
            Clear Drawing
          </button>
          <button
            onClick={onSubmitDrawing}
            className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded shadow-md text-xs font-semibold transition-colors duration-150"
          >
            Submit Drawing
          </button>
        </>
      )}
      {myRole === 'guesser' && guessingActive && !gameOver && (
        <button
          onClick={onEndGuessing}
          className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded shadow-md text-xs font-semibold transition-colors duration-150"
        >
          End Guessing
        </button>
      )}
    </div>
  );
};

export default PlayerControls;
