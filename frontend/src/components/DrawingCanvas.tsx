import React, { useRef, useState, useEffect } from 'react';
import { Stage, Layer, Line as KonvaLine } from 'react-konva';
import Konva from 'konva';

// This should align with the stroke data structure used across the app
export interface StrokeData {
  id: string; // Unique ID for the stroke
  points: number[]; // Flat array of points [x1, y1, x2, y2, ...]
  color: string;
  width: number;
  tool: 'pen' | 'eraser'; // Added tool property
  clientId?: string; // Optional: if you need to know who drew it
}

export interface DrawingCanvasProps {
  width: number;
  height: number;
  strokes: StrokeData[];
  onDrawEnd: (newStroke: Omit<StrokeData, 'id' | 'clientId'>) => void; 
  isDrawingEnabled: boolean;
  currentTool: 'pen' | 'eraser'; // Added currentTool prop
  selectedColor: string; // NEW: Color for the pen
  selectedBrushSize: number; // NEW: Size for pen and eraser
  // If you have onDrawStart and onDrawMove, their signatures might need tool info too
  // onDrawStart?: (point: { x: number; y: number }) => void;
  // onDrawMove?: (point: { x: number; y: number }) => void;
}

const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  width,
  height,
  strokes,
  onDrawEnd,
  isDrawingEnabled,
  currentTool,
  selectedColor,      // No default, passed from GamePage
  selectedBrushSize,  // No default, passed from GamePage
}) => {
  const [isPainting, setIsPainting] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<number[]>([]);
  const stageRef = useRef<Konva.Stage>(null);

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawingEnabled) return;
    setIsPainting(true);
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    setCurrentPoints([pos.x, pos.y]);
    // onDrawStart?.({ x: pos.x, y: pos.y }); // If using this prop
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isPainting || !isDrawingEnabled) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;
    setCurrentPoints(prevPoints => [...prevPoints, pos.x, pos.y]);
    // onDrawMove?.({ x: pos.x, y: pos.y }); // If using this prop
  };

  const handleMouseUp = () => {
    if (!isPainting || !isDrawingEnabled) return;
    setIsPainting(false);
    if (currentPoints.length > 0) {
      onDrawEnd({
        points: currentPoints,
        color: currentTool === 'eraser' ? '#ffffff' : selectedColor, // Eraser 'color' is arbitrary for destination-out
        width: selectedBrushSize,
        tool: currentTool,
      });
    }
    setCurrentPoints([]);
  };

  return (
    <Stage
      width={width}
      height={height}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp} // End drawing if mouse leaves canvas
      ref={stageRef}
      style={{ border: '1px solid #ccc', touchAction: 'none' }}
    >
      <Layer>
        {/* Render completed strokes from prop */} 
        {strokes.map((stroke) => (
          <KonvaLine
            key={stroke.id}
            points={stroke.points}
            stroke={stroke.tool === 'eraser' ? '#ffffff' : stroke.color} // Eraser color doesn't matter with destination-out
            strokeWidth={stroke.width}
            tension={0.5}
            lineCap="round"
            lineJoin="round"
            globalCompositeOperation={
              stroke.tool === 'eraser' ? 'destination-out' : 'source-over'
            }
          />
        ))}
        {/* Render the current line being drawn */} 
        {isPainting && currentPoints.length > 0 && (
          <KonvaLine
            points={currentPoints}
            stroke={currentTool === 'eraser' ? '#ffffff' : selectedColor}
            strokeWidth={selectedBrushSize}
            tension={0.5}
            lineCap="round"
            lineJoin="round"
            globalCompositeOperation={
              currentTool === 'eraser' ? 'destination-out' : 'source-over'
            }
          />
        )}
      </Layer>
    </Stage>
  );
};

export default DrawingCanvas;
