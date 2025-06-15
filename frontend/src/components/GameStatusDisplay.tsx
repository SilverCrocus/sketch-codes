import React from 'react';

interface GameStatusDisplayProps {
  turnNumber: number;
  drawingPhaseActive: boolean;
  guessingActive: boolean;
  drawingSubmitted: boolean;
  myRole: 'drawer' | 'guesser' | 'spectator' | 'connecting' | null;
  currentClue: { word: string; number: number } | null;
  // Add scoreA and scoreB if we decide to display scores later
  // scoreA?: number;
  // scoreB?: number;
}

const GameStatusDisplay: React.FC<GameStatusDisplayProps> = ({
  turnNumber,
  drawingPhaseActive,
  guessingActive,
  drawingSubmitted,
  myRole,
  currentClue,
}) => {
  const phaseText = drawingPhaseActive ? 'Drawing' : guessingActive ? 'Guessing' : 'Waiting';
  const submittedText = drawingSubmitted ? ' (Submitted)' : '';
  const roleText =
    myRole === 'connecting'
      ? 'Connecting...'
      : myRole
        ? myRole.charAt(0).toUpperCase() + myRole.slice(1)
        : 'N/A';

  return (
    <div className="p-2 bg-gray-100 rounded-lg shadow-md text-xs space-y-1">
      <div className="flex justify-between items-center">
        <p className="font-semibold text-gray-700">Turn:</p>
        <p className="font-mono text-blue-600">{turnNumber}</p>
      </div>
      <div className="flex justify-between items-center">
        <p className="font-semibold text-gray-700">Phase:</p>
        <p className="text-blue-600">
          {phaseText}
          {submittedText}
        </p>
      </div>
      <div className="flex justify-between items-center">
        <p className="font-semibold text-gray-700">Role:</p>
        <p className="text-blue-600">{roleText}</p>
      </div>

      {currentClue &&
        typeof currentClue.word === 'string' &&
        typeof currentClue.number === 'number' && (
          <div className="mt-2 pt-2 border-t border-gray-300">
            <p className="text-xs font-semibold text-gray-700 text-center">Current Clue:</p>
            <p className="text-lg font-bold text-yellow-700 text-center">
              {currentClue.word} - {currentClue.number}
            </p>
          </div>
        )}
    </div>
  );
};

export default GameStatusDisplay;
